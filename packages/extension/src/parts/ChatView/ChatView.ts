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
  eventListeners: [
    {
      name: 'handleSessionsSashPointerDown',
      params: [
        'handleSessionsSashPointerDown',
        'event.clientX',
        'event.currentTarget.parentElement.clientWidth',
        'event.currentTarget.parentElement.offsetLeft',
        'event.currentTarget.previousElementSibling.offsetLeft',
        'event.currentTarget.previousElementSibling.offsetWidth',
      ],
      trackPointerEvents: [
        'handleSessionsSashPointerMove',
        'handleSessionsSashPointerUp',
      ],
    },
    {
      name: 'handleSessionsSashPointerMove',
      params: ['handleSessionsSashPointerMove', 'event.clientX'],
    },
    {
      name: 'handleSessionsSashPointerUp',
      params: ['handleSessionsSashPointerUp'],
    },
    {
      name: 'handleImagePaste',
      params: [
        'handleImagePaste',
        'event.clipboardData.files2',
        'event.clipboardData.text',
        'event.target.selectionStart',
        'event.target.selectionEnd',
      ],
      preventDefault: true,
    },
    {
      name: 'handleModelPickerOutsideClick',
      params: [
        'handleModelPickerOutsideClick',
        'event.target.name',
        'event.target.value',
      ],
    },
    {
      name: 'handleKeyDown',
      params: ['handleKeyDown', 'event.key'],
    },
    {
      name: 'handleImageDrop',
      params: ['handleImageDrop', 'event.dropId'],
      preventDefault: true,
    },
    {
      name: 'handleDragOver',
      params: ['handleDragOver'],
      preventDefault: true,
    },
  ],
  getComponentState: (instance) => instance.getState(),
  icon: 'comment-discussion',
  id: viewId,
  kind: 'virtualDom',
  setComponentState: (instance, state) => instance.setState(state),
  title: 'Chat 2',
}
