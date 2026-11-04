import { NodeRpcProcess } from '@lvce-editor/rpc'
import { createNodeCommandExecutor } from './parts/NodeCommandExecutor/NodeCommandExecutor.ts'

const requests = new Map<string, AbortController>()

await NodeRpcProcess.create({
  commandMap: {
    'ChatCommand.cancel'(id: string): void {
      requests.get(id)?.abort()
    },
    async 'ChatCommand.execute'(
      id: string,
      workspaceUri: string,
      command: string,
      options: { readonly timeoutMs: number; readonly outputLimit: number },
    ) {
      const executor = createNodeCommandExecutor({
        getWorkspaceFolder: async () => workspaceUri,
      })
      if (!executor) {
        throw new Error('Desktop command execution is unavailable')
      }
      const controller = new AbortController()
      requests.set(id, controller)
      try {
        return await executor.execute(command, {
          ...options,
          onOutput() {},
          signal: controller.signal,
        })
      } finally {
        requests.delete(id)
      }
    },
  },
})
