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

export interface ChatTask {
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
  readonly onUpdate?: (task: ChatTask) => void | Promise<void>
  readonly signal?: AbortSignal
}

export interface ChatApi {
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
