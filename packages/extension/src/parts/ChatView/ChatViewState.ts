import type {
  ChatImageAttachment,
  ChatModel,
  ChatTask,
} from '../ChatApi/ChatApi.ts'
import type { AiNativeTheme } from './AiNativeTheme.ts'

export interface ChatComposerImage {
  readonly attachment?: ChatImageAttachment
  readonly id: string
  readonly name: string
  readonly status: 'error' | 'loading' | 'ready'
}

export interface ChatViewState {
  readonly activityExpanded: boolean
  readonly aiNativeTheme: AiNativeTheme
  readonly changesExpanded: boolean
  readonly composerFocused: boolean
  readonly composerImages: readonly ChatComposerImage[]
  readonly copiedMessageId: string
  readonly draft: string
  readonly errorMessage: string
  readonly focusMode: boolean
  readonly focusModeEnabled: boolean
  readonly fontFamily: string
  readonly fontSize: string
  readonly loginPending: boolean
  readonly loginRequired: boolean
  readonly modelPickerOpen: boolean
  readonly models: readonly ChatModel[]
  readonly selectedModelId: string
  readonly selectedTask: ChatTask | undefined
  readonly tasks: readonly ChatTask[]
  readonly workingSeconds: number
}
