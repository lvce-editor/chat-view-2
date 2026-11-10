import { LazyTransferMessagePortRpcParent } from '@lvce-editor/rpc'
import {
  DragAndDropWorker,
  ExtensionManagementWorker,
} from '@lvce-editor/rpc-registry'

interface FileHandleTransportItem {
  readonly kind: 'file' | 'file-legacy'
  readonly path?: string
  readonly value: File | FileSystemHandle
}

const state: { initialization?: Promise<void> } = {}

const sendMessagePortToDragAndDropWorker = async (
  port: MessagePort,
): Promise<void> => {
  await ExtensionManagementWorker.invokeAndTransfer(
    'SendMessagePortToExtensionHostWorker.sendMessagePortToRendererProcess',
    port,
    'DragAndDrop.handleMessagePort',
  )
}

const initialize = async (): Promise<void> => {
  const dragAndDropRpc = await LazyTransferMessagePortRpcParent.create({
    commandMap: {},
    send: sendMessagePortToDragAndDropWorker,
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

export const getFileHandles = (
  ids: readonly number[],
): Promise<readonly FileHandleTransportItem[]> => {
  return ExtensionManagementWorker.invoke('FileHandles.get', ids)
}
