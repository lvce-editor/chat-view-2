import type { ChatModel, ChatTask } from '../ChatApi/ChatApi.ts'

export interface ChatViewState {
  activityExpanded: boolean
  changesExpanded: boolean
  composerFocused: boolean
  copiedMessageId: string
  draft: string
  errorMessage: string
  focusMode: boolean
  focusModeEnabled: boolean
  fontFamily: string
  fontSize: string
  modelPickerOpen: boolean
  models: readonly ChatModel[]
  selectedModelId: string
  selectedTask: ChatTask | undefined
  tasks: readonly ChatTask[]
}
