import type { ChatTask } from '../ChatApi/ChatApi.ts'

export interface ChatViewState {
  composerFocused: boolean
  draft: string
  selectedTask: ChatTask | undefined
  tasks: readonly ChatTask[]
}
