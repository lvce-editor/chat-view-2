import type { ChatApi, ChatMessage, ChatTask } from '../ChatApi/ChatApi.ts'

const mockResponse =
  'This is a mock response. Chat 2 is not connected to an API yet.'

const taskTitles = [
  'Add worker memory usage',
  'Fix quickpick beforeinput crash',
  'Fix running extensions view',
  'Extract context menu handler',
  'Dispose webcontentsview on close',
  'Enable TypeScript autofix tests',
  'Open browser in preview area',
  'Add devcontainer e2e tests',
  'Add extension icon',
  'Add quickpick command',
  'Add running extensions POM',
  'Fix activity bar icons',
  'Use flex in hetzner extension',
  'Add chat labels',
  'Disallow e2e imports',
  'Fix Hetzner mobile graphs',
  'Add Hetzner API key name',
  'Fix TypeScript highlighting',
  'Enable TypeScript diagnostics e2e',
  'Triage open PRs',
] as const

const createMockMessages = (title: string): readonly ChatMessage[] => {
  return [
    {
      role: 'user',
      text: title,
    },
    {
      role: 'assistant',
      text: mockResponse,
    },
  ]
}

const createMockTasks = (): readonly ChatTask[] => {
  return taskTitles.map((title, index) => ({
    id: `mock-task-${index + 1}`,
    messages: createMockMessages(title),
    title,
  }))
}

const getTitle = (message: string): string => {
  const firstLine = message.split('\n', 1)[0] || 'New task'
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
}

export const createMockChatApi = (): ChatApi => {
  let tasks = createMockTasks()
  let nextTaskId = tasks.length + 1

  return {
    async createTask(message: string): Promise<ChatTask> {
      const task: ChatTask = {
        id: `mock-task-${nextTaskId++}`,
        messages: createMockMessages(message),
        title: getTitle(message),
      }
      tasks = [task, ...tasks].slice(0, 20)
      return task
    },
    async getTask(id: string): Promise<ChatTask | undefined> {
      return tasks.find((task) => task.id === id)
    },
    async listTasks(limit: number): Promise<readonly ChatTask[]> {
      return tasks.slice(0, Math.max(0, limit))
    },
    async sendMessage(task: ChatTask, message: string): Promise<ChatTask> {
      const updatedTask: ChatTask = {
        ...task,
        messages: [...task.messages, ...createMockMessages(message)],
      }
      tasks = tasks.map((item) => (item.id === task.id ? updatedTask : item))
      return updatedTask
    },
  }
}

export { mockResponse }
