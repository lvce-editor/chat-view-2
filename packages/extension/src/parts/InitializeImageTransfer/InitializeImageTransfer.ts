import {
  LazyTransferMessagePortRpcParent,
  WebWorkerRpcClient,
} from '@lvce-editor/rpc'
import { DragAndDropWorker, RendererWorker } from '@lvce-editor/rpc-registry'

const state: { initialization?: Promise<void> } = {}

const initialize = async (): Promise<void> => {
  RendererWorker.set(await WebWorkerRpcClient.create({ commandMap: {} }))
  const dragAndDropRpc = await LazyTransferMessagePortRpcParent.create({
    commandMap: {},
    send: RendererWorker.sendMessagePortToDragAndDropWorker,
  })
  DragAndDropWorker.set(dragAndDropRpc)
}

export const initializeImageTransfer = (): Promise<void> => {
  const { initialization } = state
  if (initialization) {
    return initialization
  }
  const promise = initialize()
  state.initialization = promise
  return promise
}
