import type { ChatModel, ChatTask } from '../ChatApi/ChatApi.ts'

export interface ChatViewState {
  activityExpanded: boolean
  changesExpanded: boolean
  composerFocused: boolean
  draft: string
  errorMessage: string
  focusMode: boolean
  focusModeEnabled: boolean
  fontSize: string
  modelPickerOpen: boolean
  models: readonly ChatModel[]
  selectedModelId: string
  selectedTask: ChatTask | undefined
  tasks: readonly ChatTask[]
}
