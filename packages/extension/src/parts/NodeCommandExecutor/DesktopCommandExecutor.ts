import type { AgentCommandExecutor } from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import { createNodeRpc, getPlatform } from '@lvce-editor/api'
import { createNodeCommandExecutor } from './NodeCommandExecutor.ts'

const processState: { rpcPromise?: ReturnType<typeof createNodeRpc> } = {}

/* processState keeps a single command process per extension host. */

export const hasCommandExecutor = async (
  workspaceUri?: string,
): Promise<boolean> => {
  if (workspaceUri && !workspaceUri.startsWith('file://')) {
    return false
  }
  if (createNodeCommandExecutor()) {
    return true
  }
  const platform = await getPlatform()
  return platform === 'electron'
}

export const getCommandExecutor = async (
  workspaceUri: string,
): Promise<AgentCommandExecutor> => {
  const local = createNodeCommandExecutor({
    getWorkspaceFolder: async () => workspaceUri,
  })
  if (local) {
    return local
  }
  if (!(await hasCommandExecutor(workspaceUri))) {
    throw new Error('Project command execution is unavailable in this browser.')
  }
  processState.rpcPromise ||= createNodeRpc({
    id: 'builtin.chat-view-2.commands',
  })
  const rpc = await processState.rpcPromise
  return {
    async execute(
      command: string,
      options: Readonly<{
        readonly signal?: Readonly<AbortSignal>
        readonly outputLimit?: number
        readonly timeoutMs?: number
      }>,
    ): Promise<{ readonly exitCode: number; readonly output: string }> {
      options.signal?.throwIfAborted()
      const id = crypto.randomUUID()
      const cancel = (): void => {
        void rpc.invoke('ChatCommand.cancel', id)
      }
      options.signal?.addEventListener('abort', cancel, { once: true })
      try {
        return (await rpc.invoke(
          'ChatCommand.execute',
          id,
          workspaceUri,
          command,
          { outputLimit: options.outputLimit, timeoutMs: options.timeoutMs },
        )) as { readonly exitCode: number; readonly output: string }
      } finally {
        options.signal?.removeEventListener('abort', cancel)
      }
    },
  }
}
