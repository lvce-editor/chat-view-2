import { WebWorkerRpcClient } from '@lvce-editor/rpc'
import * as CommandMap from './parts/TypeScriptEvaluationWorker/TypeScriptEvaluationWorkerCommandMap.ts'

const globalScope = globalThis as typeof globalThis & { rpc?: unknown }

if (!globalScope.rpc) {
  globalScope.rpc = await WebWorkerRpcClient.create({
    commandMap: CommandMap.commandMap,
  })
}
