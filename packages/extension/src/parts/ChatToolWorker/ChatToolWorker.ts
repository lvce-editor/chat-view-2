/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-promise-reject-errors, @typescript-eslint/prefer-readonly-parameter-types, unicorn/no-await-expression-member, unicorn/no-top-level-assignment-in-function, unicorn/prefer-await */
import type {
  AgentEditorContext,
  AgentFileSystemAccess,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolHost,
  AgentToolResult,
  AgentVerificationResult,
  ChatChangedFile,
  TypeScriptExecutionResult,
} from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import {
  createRpc,
  exists,
  getWorkspaceUri,
  readDirWithFileTypes,
  readFile,
  remove,
  writeFile,
} from '@lvce-editor/api'
import { getDefaultComputerUseToolHost } from '../ComputerUseToolHost/ComputerUseToolHost.ts'
import { createNodeCommandExecutor } from '../NodeCommandExecutor/NodeCommandExecutor.ts'
import { executeTypeScript } from '../TypeScriptEvaluationWorker/TypeScriptEvaluationWorker.ts'

interface Rpc {
  readonly dispose: () => Promise<void> | void
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<unknown>
}

interface CommandOptions {
  readonly outputLimit: number
  readonly timeoutMs: number
}

interface Capabilities {
  readonly commandExecutor: boolean
  readonly editorContext: boolean
}

const rpcId = 'builtin.chat-view-2.chat-tool-worker'
let rpcPromise: Promise<Rpc> | undefined
const commandRequests = new Map<string, AbortController>()
const externalHostPromise = getDefaultComputerUseToolHost()
const commandExecutor = createNodeCommandExecutor()

const getRpc = (): Promise<Rpc> => {
  rpcPromise ||= createRpc({
    commandMap: {
      'ChatToolWorkerHost.cancelCommand'(requestId: string): void {
        commandRequests.get(requestId)?.abort()
      },
      async 'ChatToolWorkerHost.executeCommand'(
        requestId: string,
        command: string,
        options: CommandOptions,
      ) {
        if (!commandExecutor) {
          throw new Error('Bash command execution is disabled')
        }
        const controller = new AbortController()
        commandRequests.set(requestId, controller)
        try {
          return await commandExecutor.execute(command, {
            ...options,
            onOutput() {},
            signal: controller.signal,
          })
        } finally {
          commandRequests.delete(requestId)
        }
      },
      async 'ChatToolWorkerHost.executeExternalTool'(
        _requestId: string,
        call: AgentToolCall,
      ): Promise<AgentToolResult> {
        const host = await externalHostPromise
        if (!host) {
          return { content: 'Computer use is unavailable', isError: true }
        }
        return host.execute(call)
      },
      async 'ChatToolWorkerHost.executeTypeScript'(
        code: string,
      ): Promise<TypeScriptExecutionResult> {
        return executeTypeScript(code)
      },
      'ChatToolWorkerHost.exists': exists,
      async 'ChatToolWorkerHost.getCapabilities'(): Promise<Capabilities> {
        return {
          commandExecutor: Boolean(commandExecutor),
          editorContext: false,
        }
      },
      async 'ChatToolWorkerHost.getEditorContext'(): Promise<AgentEditorContext> {
        return {}
      },
      async 'ChatToolWorkerHost.getExternalToolDefinitions'(): Promise<
        readonly AgentToolDefinition[] | undefined
      > {
        return (await externalHostPromise)?.getDefinitions()
      },
      async 'ChatToolWorkerHost.getExternalToolInstructions'(): Promise<
        string | undefined
      > {
        return (await externalHostPromise)?.getInstructions()
      },
      'ChatToolWorkerHost.getWorkspaceUri': getWorkspaceUri,
      'ChatToolWorkerHost.readDirWithFileTypes': readDirWithFileTypes,
      'ChatToolWorkerHost.readFile': readFile,
      'ChatToolWorkerHost.remove': remove,
      'ChatToolWorkerHost.writeFile': writeFile,
    },
    id: rpcId,
  }) as Promise<Rpc>
  return rpcPromise
}

const createRequestId = (): string => `chat-tool-${crypto.randomUUID()}`

const invoke = <T>(method: string, ...params: readonly unknown[]): Promise<T> =>
  getRpc().then((rpc) => rpc.invoke(method, ...params) as Promise<T>)

const invokeCancellable = <T>(
  method: string,
  signal: AbortSignal | undefined,
  ...params: readonly unknown[]
): Promise<T> => {
  const requestId = createRequestId()
  const request = invoke<T>(method, ...params, requestId)
  if (!signal) {
    return request
  }
  const abort = (): void => {
    void invoke('ChatToolWorker.cancel', requestId)
  }
  signal.addEventListener('abort', abort, { once: true })
  return Promise.race([
    request,
    new Promise<T>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    }),
  ]).finally(() => signal.removeEventListener('abort', abort))
}

export interface RemoteAgentToolHost extends AgentToolHost {
  readonly dispose: () => Promise<void>
}

export const createRemoteAgentToolHost = async (
  fileSystemAccess?: AgentFileSystemAccess,
): Promise<RemoteAgentToolHost> => {
  const sessionId = `session-${crypto.randomUUID()}`
  await invoke('ChatToolWorker.createSession', sessionId, {
    ...(fileSystemAccess && { fileSystemAccess }),
  })
  return {
    async beginTurn(taskId) {
      await invoke('ChatToolWorker.beginTurn', sessionId, taskId)
    },
    async dispose(): Promise<void> {
      await invoke('ChatToolWorker.disposeSession', sessionId)
    },
    async execute(call, signal) {
      return invokeCancellable<AgentToolResult>(
        'ChatToolWorker.execute',
        signal,
        sessionId,
        call,
      )
    },
    async getChangedFiles(): Promise<readonly ChatChangedFile[]> {
      return invoke('ChatToolWorker.getChangedFiles', sessionId)
    },
    async getDefinitions(): Promise<readonly AgentToolDefinition[]> {
      return invoke('ChatToolWorker.getDefinitions', sessionId)
    },
    async getWorkspaceContext(): Promise<string> {
      return invoke('ChatToolWorker.getWorkspaceContext', sessionId)
    },
    async revert(): Promise<readonly ChatChangedFile[]> {
      return invoke('ChatToolWorker.revert', sessionId)
    },
    async verifyChanges(
      signal?: AbortSignal,
    ): Promise<AgentVerificationResult> {
      return invokeCancellable<AgentVerificationResult>(
        'ChatToolWorker.verifyChanges',
        signal,
        sessionId,
      )
    },
  }
}
