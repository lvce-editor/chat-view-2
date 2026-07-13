import type { ChatTask } from '../ChatApi/ChatApi.ts'

export interface ChatViewState {
  draft: string
  selectedTask: ChatTask | undefined
  tasks: readonly ChatTask[]
}
