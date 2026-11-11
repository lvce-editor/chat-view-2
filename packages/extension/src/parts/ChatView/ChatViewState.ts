import type {
  ChatAllowance,
  ChatImageAttachment,
  ChatModel,
  ChatTask,
  ChatUserMessageEvent,
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
  readonly assistantMessageFontFamily: string
  readonly changesExpanded: boolean
  readonly composerFocused: boolean
  readonly composerImages: readonly ChatComposerImage[]
  readonly copiedCodeId: string
  readonly copiedMessageId: string
  readonly draft: string
  readonly errorMessage: string
  readonly focusMode: boolean
  readonly focusModeEnabled: boolean
  readonly followUpBehavior?: 'queue' | 'steer'
  readonly fontFamily: string
  readonly fontSize: string
  readonly imagePreview?: ChatImageAttachment | undefined
  readonly loginPending: boolean
  readonly loginRequired: boolean
  readonly modelPickerOpen: boolean
  readonly models: readonly ChatModel[]
  readonly preserveComposerValue?: boolean
  readonly queuedMessages?: readonly {
    readonly taskId: string
    readonly event: ChatUserMessageEvent
  }[]
  readonly selectedModelId: string
  readonly selectedTask: ChatTask | undefined
  readonly selectedThinkingMode: 'low' | 'medium' | 'high'
  readonly sessionsListVisible: boolean
  readonly sessionsVisible: boolean
  readonly sessionsWidth?: number
  readonly statusPopup?: ChatStatusPopup | undefined
  readonly taskOpenMode: TaskOpenMode
  readonly tasks: readonly ChatTask[]
  readonly thinkingModeEnabled: boolean
  readonly thinkingModePickerOpen: boolean
  readonly userMessageFontFamily: string
  readonly workingSeconds: number
}
