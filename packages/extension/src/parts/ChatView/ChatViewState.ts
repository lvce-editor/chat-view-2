import type { ChatModel, ChatTask } from '../ChatApi/ChatApi.ts'

export interface ChatViewState {
  activityExpanded: boolean
  composerFocused: boolean
  draft: string
  errorMessage: string
  modelPickerOpen: boolean
  models: readonly ChatModel[]
  selectedModelId: string
  selectedTask: ChatTask | undefined
  tasks: readonly ChatTask[]
}
