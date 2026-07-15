import type { ChatModel, ChatTask } from '../ChatApi/ChatApi.ts'

export interface ChatViewState {
  readonly activityExpanded: boolean
  readonly changesExpanded: boolean
  readonly composerFocused: boolean
  readonly copiedMessageId: string
  readonly draft: string
  readonly errorMessage: string
  readonly focusMode: boolean
  readonly focusModeEnabled: boolean
  readonly fontFamily: string
  readonly fontSize: string
  readonly modelPickerOpen: boolean
  readonly models: readonly ChatModel[]
  readonly selectedModelId: string
  readonly selectedTask: ChatTask | undefined
  readonly tasks: readonly ChatTask[]
  readonly workingSeconds: number
}
