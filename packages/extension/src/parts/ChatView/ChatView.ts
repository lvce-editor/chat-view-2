import type { View } from '@lvce-editor/api'
import type { ChatViewState } from './ChatViewState.ts'
import {
  createInstance,
  type ActiveChatViewInstance,
} from './CreateInstance.ts'

export const viewId = 'chat2.views.chat'

export const view: View<ActiveChatViewInstance, ChatViewState> = {
  create: createInstance,
  displayName: 'Chat 2',
  getComponentState: (instance) => instance.getState(),
  icon: 'comment-discussion',
  id: viewId,
  kind: 'virtualDom',
  setComponentState: (instance, state) => instance.setState(state),
  title: 'Chat 2',
}
