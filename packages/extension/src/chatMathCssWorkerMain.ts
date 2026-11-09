import { WebWorkerRpcClient } from '@lvce-editor/rpc'
import { katexCss } from './parts/ChatView/KatexCss.ts'

const globalScope = globalThis as typeof globalThis & { rpc?: unknown }

if (!globalScope.rpc) {
  globalScope.rpc = await WebWorkerRpcClient.create({
    commandMap: {
      'ChatMathCss.getStylesheet'(): string {
        return katexCss
      },
    },
  })
}
