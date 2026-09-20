/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-promise-reject-errors, @typescript-eslint/prefer-readonly-parameter-types */
import { WebWorkerRpcClient } from '@lvce-editor/rpc'
import type {
  AgentCommandExecutor,
  AgentEditorContextProvider,
  AgentExternalToolHost,
  AgentFileSystem,
  AgentFileSystemAccess,
  AgentToolCall,
  AgentToolHost,
  AgentToolResult,
  TypeScriptExecutionResult,
} from './parts/AgentToolHost/AgentToolHost.ts'
import { createAgentToolHost } from './parts/AgentToolHost/AgentToolHost.ts'

interface Rpc {
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<unknown>
}

interface RequestState {
  readonly controller: AbortController
  readonly sessionId: string
}

interface SessionOptions {
  readonly fileSystemAccess?: AgentFileSystemAccess
}

const sessions = new Map<string, AgentToolHost>()
const requests = new Map<string, RequestState>()

const getParentRpc = (): Rpc => {
  return parentRpc
}

const getSession = (sessionId: string): AgentToolHost => {
  const session = sessions.get(sessionId)
  if (!session) {
    throw new Error(`Chat tool session was not found: ${sessionId}`)
  }
  return session
}

const createRemoteFileSystem = (): AgentFileSystem => {
  const rpc = getParentRpc()
  return {
    exists: (uri) =>
      rpc.invoke('ChatToolWorkerHost.exists', uri) as Promise<boolean>,
    readDirWithFileTypes: (uri) =>
      rpc.invoke('ChatToolWorkerHost.readDirWithFileTypes', uri) as Promise<
        readonly { readonly name: string; readonly type: number }[]
      >,
    readFile: (uri) =>
      rpc.invoke('ChatToolWorkerHost.readFile', uri) as Promise<string>,
    remove: (uri) =>
      rpc.invoke('ChatToolWorkerHost.remove', uri) as Promise<void>,
    writeFile: (uri, content) =>
      rpc.invoke('ChatToolWorkerHost.writeFile', uri, content) as Promise<void>,
  }
}

const createRemoteCommandExecutor = (): AgentCommandExecutor => ({
  async execute(command, options) {
    const requestId = `command-${crypto.randomUUID()}`
    const rpc = getParentRpc()
    const cancel = (): void => {
      void rpc.invoke('ChatToolWorkerHost.cancelCommand', requestId)
    }
    options.signal?.addEventListener('abort', cancel, { once: true })
    try {
      return (await rpc.invoke(
        'ChatToolWorkerHost.executeCommand',
        requestId,
        command,
        { outputLimit: options.outputLimit, timeoutMs: options.timeoutMs },
      )) as { readonly exitCode: number; readonly output: string }
    } finally {
      options.signal?.removeEventListener('abort', cancel)
    }
  },
})

const createRemoteExternalToolHost = async (): Promise<
  AgentExternalToolHost | undefined
> => {
  const rpc = getParentRpc()
  const [definitions, instructions] = await Promise.all([
    rpc.invoke('ChatToolWorkerHost.getExternalToolDefinitions'),
    rpc.invoke('ChatToolWorkerHost.getExternalToolInstructions'),
  ])
  if (!Array.isArray(definitions) || typeof instructions !== 'string') {
    return undefined
  }
  return {
    async execute(
      call: AgentToolCall,
      signal?: AbortSignal,
    ): Promise<AgentToolResult> {
      const requestId = `external-${crypto.randomUUID()}`
      const result = rpc.invoke(
        'ChatToolWorkerHost.executeExternalTool',
        requestId,
        call,
      ) as Promise<AgentToolResult>
      if (!signal) {
        return result
      }
      return Promise.race([
        result,
        new Promise<AgentToolResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
      ])
    },
    getDefinitions() {
      return definitions
    },
    getInstructions() {
      return instructions
    },
  }
}

const createRemoteEditorContextProvider = (): AgentEditorContextProvider => ({
  getContext: () =>
    getParentRpc().invoke('ChatToolWorkerHost.getEditorContext') as Promise<{
      readonly activeFile?: string
      readonly diagnostics?: readonly string[]
      readonly selection?: string
    }>,
})

const createRemoteTypeScriptExecutor = (
  code: string,
): Promise<TypeScriptExecutionResult> =>
  getParentRpc().invoke(
    'ChatToolWorkerHost.executeTypeScript',
    code,
  ) as Promise<TypeScriptExecutionResult>

const createSession = async (
  sessionId: string,
  options: SessionOptions = {},
): Promise<void> => {
  if (sessions.has(sessionId)) {
    throw new Error(`Chat tool session already exists: ${sessionId}`)
  }
  const [externalToolHost, capabilities] = await Promise.all([
    createRemoteExternalToolHost(),
    getParentRpc().invoke('ChatToolWorkerHost.getCapabilities') as Promise<{
      readonly commandExecutor: boolean
      readonly editorContext: boolean
    }>,
  ])
  sessions.set(
    sessionId,
    createAgentToolHost({
      ...(capabilities.commandExecutor && {
        commandExecutor: createRemoteCommandExecutor(),
      }),
      ...(capabilities.editorContext && {
        editorContextProvider: createRemoteEditorContextProvider(),
      }),
      ...(externalToolHost && { externalToolHost }),
      fileSystem: createRemoteFileSystem(),
      ...(options.fileSystemAccess && {
        fileSystemAccess: options.fileSystemAccess,
      }),
      typeScriptExecutor: createRemoteTypeScriptExecutor,
      workspaceUriProvider: () =>
        getParentRpc().invoke(
          'ChatToolWorkerHost.getWorkspaceUri',
        ) as Promise<string>,
    }),
  )
}

const disposeSession = (sessionId: string): void => {
  sessions.delete(sessionId)
  for (const [requestId, request] of requests) {
    if (request.sessionId !== sessionId) {
      continue
    }

    request.controller.abort()
    requests.delete(requestId)
  }
}

const commandMap = {
  async 'ChatToolWorker.beginTurn'(
    sessionId: string,
    taskId: string,
  ): Promise<void> {
    await getSession(sessionId).beginTurn(taskId)
  },
  'ChatToolWorker.cancel'(requestId: string): void {
    requests.get(requestId)?.controller.abort()
  },
  'ChatToolWorker.createSession': createSession,
  'ChatToolWorker.disposeSession': disposeSession,
  async 'ChatToolWorker.execute'(
    sessionId: string,
    call: AgentToolCall,
    requestId: string,
  ) {
    const controller = new AbortController()
    requests.set(requestId, { controller, sessionId })
    try {
      return await getSession(sessionId).execute(call, controller.signal)
    } finally {
      requests.delete(requestId)
    }
  },
  async 'ChatToolWorker.getChangedFiles'(sessionId: string) {
    return getSession(sessionId).getChangedFiles()
  },
  async 'ChatToolWorker.getDefinitions'(sessionId: string) {
    return getSession(sessionId).getDefinitions()
  },
  async 'ChatToolWorker.getWorkspaceContext'(sessionId: string) {
    return getSession(sessionId).getWorkspaceContext()
  },
  async 'ChatToolWorker.revert'(sessionId: string) {
    return getSession(sessionId).revert()
  },
  async 'ChatToolWorker.verifyChanges'(sessionId: string, requestId: string) {
    const controller = new AbortController()
    requests.set(requestId, { controller, sessionId })
    try {
      return await getSession(sessionId).verifyChanges?.(controller.signal)
    } finally {
      requests.delete(requestId)
    }
  },
}

const parentRpc = await WebWorkerRpcClient.create({ commandMap })
