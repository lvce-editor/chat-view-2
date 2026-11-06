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
  getActiveEditor,
  getDiagnostics,
  getWorkspaceUri,
  readDirWithFileTypes,
  remove,
} from '@lvce-editor/api'
import { getDefaultComputerUseToolHost } from '../ComputerUseToolHost/ComputerUseToolHost.ts'
import {
  getCommandExecutor,
  hasCommandExecutor,
} from '../NodeCommandExecutor/DesktopCommandExecutor.ts'
import { executeTypeScript } from '../TypeScriptEvaluationWorker/TypeScriptEvaluationWorker.ts'
import { readWorkspaceFile, writeWorkspaceFile } from './WorkspaceFiles.ts'

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
        workspaceUri?: string,
      ) {
        const executor = await getCommandExecutor(
          workspaceUri ?? (await getWorkspaceUri()),
        )
        const controller = new AbortController()
        commandRequests.set(requestId, controller)
        try {
          return await executor.execute(command, {
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
        const host = await getDefaultComputerUseToolHost()
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
      async 'ChatToolWorkerHost.getCapabilities'(
        workspaceUri?: string,
      ): Promise<Capabilities> {
        return {
          commandExecutor: await hasCommandExecutor(workspaceUri),
          editorContext: true,
        }
      },
      async 'ChatToolWorkerHost.getEditorContext'(): Promise<AgentEditorContext> {
        const editor = await getActiveEditor()
        if (!editor) {
          return {}
        }
        const diagnostics = await getDiagnostics()
        return {
          activeFile: editor.uri,
          diagnostics: diagnostics.map(
            (diagnostic) =>
              `${diagnostic.uri || editor.uri}:${diagnostic.rowIndex + 1}:${diagnostic.columnIndex + 1}: ${diagnostic.message}`,
          ),
        }
      },
      async 'ChatToolWorkerHost.getExternalToolDefinitions'(): Promise<
        readonly AgentToolDefinition[] | undefined
      > {
        return (await getDefaultComputerUseToolHost())?.getDefinitions()
      },
      async 'ChatToolWorkerHost.getExternalToolInstructions'(): Promise<
        string | undefined
      > {
        return (await getDefaultComputerUseToolHost())?.getInstructions()
      },
      'ChatToolWorkerHost.getWorkspaceUri': getWorkspaceUri,
      'ChatToolWorkerHost.readDirWithFileTypes': readDirWithFileTypes,
      'ChatToolWorkerHost.readFile': readWorkspaceFile,
      'ChatToolWorkerHost.remove': remove,
      'ChatToolWorkerHost.writeFile': writeWorkspaceFile,
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
  workspaceUri?: string,
): Promise<RemoteAgentToolHost> => {
  const sessionId = `session-${crypto.randomUUID()}`
  const capabilities = await invoke<{ readonly verification: boolean }>(
    'ChatToolWorker.createSession',
    sessionId,
    {
      ...(fileSystemAccess && { fileSystemAccess }),
      ...(workspaceUri !== undefined && { workspaceUri }),
    },
  )
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
    ...(capabilities.verification && {
      async verifyChanges(
        signal?: AbortSignal,
      ): Promise<AgentVerificationResult> {
        return invokeCancellable<AgentVerificationResult>(
          'ChatToolWorker.verifyChanges',
          signal,
          sessionId,
        )
      },
    }),
  }
}
