import { WebWorkerRpcClient } from '@lvce-editor/rpc'
import katexCss from 'katex/dist/katex.min.css'

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
