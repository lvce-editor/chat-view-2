/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
export type ChatTaskStatus =
  | 'completed'
  | 'failed'
  | 'idle'
  | 'running'
  | 'stopping'

export interface ChatModel {
  readonly available: boolean
  readonly id: string
  readonly label: string
  readonly planEligible: boolean
}

export interface ChatChangedFile {
  readonly additions: number
  readonly deletions: number
  readonly path: string
  readonly status: 'added' | 'deleted' | 'modified'
}

interface ChatTaskEventBase {
  readonly id: string
  readonly timestamp: string
}

export interface ChatUserMessageEvent extends ChatTaskEventBase {
  readonly text: string
  readonly type: 'user-message'
}

export interface ChatAssistantMessageEvent extends ChatTaskEventBase {
  readonly text: string
  readonly type: 'assistant-message'
}

export interface ChatActivityEvent extends ChatTaskEventBase {
  readonly detail?: string
  readonly label: string
  readonly status: 'completed' | 'failed' | 'running'
  readonly type: 'activity'
}

export interface ChatChangesEvent extends ChatTaskEventBase {
  readonly checksPassed: number
  readonly files: readonly ChatChangedFile[]
  readonly type: 'changes'
}

export interface ChatErrorEvent extends ChatTaskEventBase {
  readonly message: string
  readonly type: 'error'
}

export interface ChatStatusEvent extends ChatTaskEventBase {
  readonly status: ChatTaskStatus
  readonly type: 'status'
}

export type ChatTaskEvent =
  | ChatActivityEvent
  | ChatAssistantMessageEvent
  | ChatChangesEvent
  | ChatErrorEvent
  | ChatStatusEvent
  | ChatUserMessageEvent

export interface ChatTraceTextContent {
  readonly text: string
  readonly type: 'text'
}

export interface ChatTraceToolCallContent {
  readonly arguments: unknown
  readonly id: string
  readonly name: string
  readonly type: 'toolCall'
}

export interface ChatTraceUserMessage {
  readonly content: string
  readonly role: 'user'
  readonly timestamp: number
}

export interface ChatTraceAssistantMessage {
  readonly content: readonly (ChatTraceTextContent | ChatTraceToolCallContent)[]
  readonly model: string
  readonly responseId: string
  readonly role: 'assistant'
  readonly timestamp: number
}

export interface ChatTraceToolResultMessage {
  readonly content: readonly ChatTraceTextContent[]
  readonly isError: boolean
  readonly role: 'toolResult'
  readonly timestamp: number
  readonly toolCallId: string
  readonly toolName: string
}

export interface ChatTraceCustomMessage {
  readonly content: string
  readonly customType: string
  readonly isError?: boolean
  readonly role: 'custom'
  readonly timestamp: number
}

export type ChatTraceMessage =
  | ChatTraceAssistantMessage
  | ChatTraceCustomMessage
  | ChatTraceToolResultMessage
  | ChatTraceUserMessage

export interface ChatTask {
  readonly archived?: boolean
  readonly createdAt: string
  readonly events: readonly ChatTaskEvent[]
  readonly id: string
  readonly modelId: string
  readonly responseId?: string
  readonly status: ChatTaskStatus
  readonly streamingText?: string
  readonly title: string
  readonly updatedAt: string
}

export interface ChatRunOptions {
  readonly onTrace?: (message: ChatTraceMessage) => void | Promise<void>
  readonly onUpdate?: (task: ChatTask) => void | Promise<void>
  readonly signal?: AbortSignal
}

export interface ChatApi {
  readonly archiveTask: (id: string) => Promise<void>
  readonly createTask: (
    message: string,
    modelId: string,
    options?: ChatRunOptions,
  ) => Promise<ChatTask>
  readonly getTask: (id: string) => Promise<ChatTask | undefined>
  readonly listModels: () => Promise<readonly ChatModel[]>
  readonly listTasks: (limit: number) => Promise<readonly ChatTask[]>
  readonly revertTask: (task: ChatTask) => Promise<ChatTask>
  readonly sendMessage: (
    task: ChatTask,
    message: string,
    options?: ChatRunOptions,
  ) => Promise<ChatTask>
  readonly steer: (taskId: string, message: string) => Promise<void>
}
