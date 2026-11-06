import type {
  ChatAllowance,
  ChatImageAttachment,
  ChatModel,
  ChatTask,
} from '../ChatApi/ChatApi.ts'
import type { AiNativeTheme } from './AiNativeTheme.ts'
import type { TaskOpenMode } from './TaskOpenMode.ts'

export interface ChatComposerImage {
  readonly attachment?: ChatImageAttachment
  readonly id: string
  readonly name: string
  readonly status: 'error' | 'loading' | 'ready'
}

export interface ChatStatusPopup {
  readonly allowance?: ChatAllowance | undefined
  readonly modelId: string
  readonly phase: 'loading' | 'ready' | 'error'
  readonly taskId?: string | undefined
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
  readonly sessionsListVisible: boolean
  readonly sessionsVisible: boolean
  readonly sessionsWidth?: number
  readonly statusPopup?: ChatStatusPopup | undefined
  readonly taskOpenMode: TaskOpenMode
  readonly tasks: readonly ChatTask[]
  readonly workingSeconds: number
}
