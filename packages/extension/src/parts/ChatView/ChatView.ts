import type { View } from '@lvce-editor/api'
import {
  createInstance,
  type ActiveChatViewInstance,
} from './CreateInstance.ts'

export const viewId = 'chat2.views.chat'

export const view: View<ActiveChatViewInstance> = {
  create: createInstance,
  displayName: 'Chat 2',
  icon: 'comment-discussion',
  id: viewId,
  kind: 'virtualDom',
  title: 'Chat 2',
}
