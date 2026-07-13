/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-promise-reject-errors, @typescript-eslint/prefer-readonly-parameter-types */
import type {
  ChatApi,
  ChatModel,
  ChatRunOptions,
  ChatTask,
} from '../ChatApi/ChatApi.ts'
import { appendEvent, createEvent, setStatus } from '../ChatTask/ChatTask.ts'

export const mockResponse =
  'I inspected the relevant files, made the scoped change, and verified the result.'

const models: readonly ChatModel[] = [
  {
    available: true,
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    planEligible: true,
  },
  {
    available: true,
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    planEligible: true,
  },
]

const taskTitles = [
  'Add worker memory usage',
  'Fix quickpick beforeinput crash',
  'Fix running extensions view',
  'Extract context menu handler',
  'Dispose web contents view on close',
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

const createTask = (
  id: string,
  title: string,
  modelId = models[0].id,
): ChatTask => {
  const timestamp = new Date().toISOString()
  return {
    createdAt: timestamp,
    events: [
      createEvent({ text: title, type: 'user-message' }),
      createEvent({ text: mockResponse, type: 'assistant-message' }),
    ],
    id,
    modelId,
    status: 'completed',
    title,
    updatedAt: timestamp,
  }
}

const getTitle = (message: string): string => {
  const firstLine = message.split('\n', 1)[0] || 'New task'
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
}

const wait = async (delayMs: number, signal?: AbortSignal): Promise<void> => {
  if (delayMs <= 0) {
    signal?.throwIfAborted()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

const emit = async (
  task: ChatTask,
  options?: ChatRunOptions,
): Promise<ChatTask> => {
  await options?.onUpdate?.(task)
  return task
}

export const createMockChatApi = (delayMs = 0): ChatApi => {
  let tasks = taskTitles.map((title, index) =>
    createTask(`mock-task-${index + 1}`, title),
  )
  let nextTaskId = tasks.length + 1
  const steering = new Map<string, string[]>()

  const run = async (
    initialTask: ChatTask,
    options?: ChatRunOptions,
  ): Promise<ChatTask> => {
    let task = await emit(setStatus(initialTask, 'running'), options)
    const activity = createEvent({
      detail: 'search_workspace',
      label: 'Inspecting workspace',
      status: 'running' as const,
      type: 'activity' as const,
    })
    task = await emit(appendEvent(task, activity), options)
    try {
      await wait(delayMs, options?.signal)
      task = appendEvent(
        task,
        createEvent({
          detail: '3 relevant files',
          label: 'Inspecting workspace',
          status: 'completed',
          type: 'activity',
        }),
      )
      const updates = steering.get(task.id) || []
      steering.delete(task.id)
      const response =
        updates.length > 0
          ? `${mockResponse}\n\nApplied steering: ${updates.join(' ')}`
          : mockResponse
      task = appendEvent(
        task,
        createEvent({ text: response, type: 'assistant-message' }),
      )
      task = appendEvent(
        task,
        createEvent({
          checksPassed: 2,
          files: [
            {
              additions: 18,
              deletions: 4,
              path: 'packages/extension/src/parts/ChatView/ChatView.ts',
              status: 'modified',
            },
            {
              additions: 12,
              deletions: 3,
              path: 'packages/extension/chat.css',
              status: 'modified',
            },
            {
              additions: 8,
              deletions: 1,
              path: 'packages/extension/src/parts/MockChatApi/MockChatApi.ts',
              status: 'modified',
            },
            {
              additions: 9,
              deletions: 0,
              path: 'packages/e2e/src/chat2.virtual-dom-view.changed-files.ts',
              status: 'added',
            },
            {
              additions: 4,
              deletions: 2,
              path: 'packages/extension/test/ChatView.test.ts',
              status: 'modified',
            },
          ],
          type: 'changes',
        }),
      )
      task = setStatus(task, 'completed')
    } catch {
      task = appendEvent(
        task,
        createEvent({ text: 'Stopped.', type: 'assistant-message' }),
      )
      task = setStatus(task, 'completed')
    }
    tasks = [task, ...tasks.filter((item) => item.id !== task.id)].slice(0, 20)
    return emit(task, options)
  }

  return {
    async createTask(message, modelId, options) {
      const task = createTask(
        `mock-task-${nextTaskId++}`,
        getTitle(message),
        modelId,
      )
      const initial: ChatTask = {
        ...task,
        events: [createEvent({ text: message, type: 'user-message' })],
        status: 'idle',
      }
      tasks = [initial, ...tasks].slice(0, 20)
      await emit(initial, options)
      return run(initial, options)
    },
    async getTask(id) {
      return tasks.find((task) => task.id === id)
    },
    async listModels() {
      return models
    },
    async listTasks(limit) {
      return tasks.slice(0, Math.max(0, limit))
    },
    async revertTask(task) {
      const changedFileCount =
        task.events.findLast((event) => event.type === 'changes')?.files
          .length || 0
      const updated = appendEvent(
        appendEvent(
          task,
          createEvent({ checksPassed: 0, files: [], type: 'changes' }),
        ),
        createEvent({
          text: `Reverted ${changedFileCount} changed ${changedFileCount === 1 ? 'file' : 'files'}.`,
          type: 'assistant-message',
        }),
      )
      tasks = tasks.map((item) => (item.id === task.id ? updated : item))
      return updated
    },
    async sendMessage(task, message, options) {
      const updated = appendEvent(
        task,
        createEvent({ text: message, type: 'user-message' }),
      )
      return run(updated, options)
    },
    async steer(taskId, message) {
      steering.set(taskId, [...(steering.get(taskId) || []), message])
    },
  }
}
