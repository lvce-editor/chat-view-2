export interface ChatMessage {
  readonly role: 'assistant' | 'user'
  readonly text: string
}

export interface ChatTask {
  readonly id: string
  readonly messages: readonly ChatMessage[]
  readonly title: string
}

export interface ChatApi {
  readonly createTask: (message: string) => Promise<ChatTask>
  readonly getTask: (id: string) => Promise<ChatTask | undefined>
  readonly listTasks: (limit: number) => Promise<readonly ChatTask[]>
  readonly sendMessage: (task: ChatTask, message: string) => Promise<ChatTask>
}
