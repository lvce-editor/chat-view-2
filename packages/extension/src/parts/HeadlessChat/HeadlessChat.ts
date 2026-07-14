import type { ChatApi, ChatTask } from '../ChatApi/ChatApi.ts'
import { createDefaultChatApi } from '../DefaultChatApi/DefaultChatApi.ts'

interface HeadlessChatSession {
  readonly api: ChatApi
  readonly modelId: string
  task?: ChatTask
}

export interface HeadlessChatCommands {
  readonly createSession: (requestedModelId?: unknown) => Promise<string>
  readonly sendMessage: (
    sessionIdOrMessage: unknown,
    message?: unknown,
  ) => Promise<ChatTask>
}

type CreateChatApi = () => Promise<ChatApi>

const getString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
  return value.trim()
}

export const createHeadlessChatCommands = (
  createChatApi: CreateChatApi = createDefaultChatApi,
): HeadlessChatCommands => {
  const sessions = new Map<string, HeadlessChatSession>()
  let activeSessionId = ''
  let nextSessionId = 1

  return {
    async createSession(requestedModelId): Promise<string> {
      const api = await createChatApi()
      const models = await api.listModels()
      const modelId =
        typeof requestedModelId === 'string' ? requestedModelId.trim() : ''
      const model = modelId
        ? models.find(
            (item) =>
              item.id === modelId && item.available && item.planEligible,
          )
        : models.find((item) => item.available && item.planEligible)
      if (!model) {
        throw new Error(
          modelId
            ? `Chat model is not available: ${modelId}`
            : 'No available chat model was found',
        )
      }
      const id = `session-${Date.now()}-${nextSessionId++}`
      sessions.set(id, { api, modelId: model.id })
      activeSessionId = id
      return id
    },
    async sendMessage(sessionIdOrMessage, messageValue): Promise<ChatTask> {
      const hasExplicitSession = messageValue !== undefined
      const sessionId = hasExplicitSession
        ? getString(sessionIdOrMessage, 'sessionId')
        : activeSessionId
      const message = getString(
        hasExplicitSession ? messageValue : sessionIdOrMessage,
        'message',
      )
      const session = sessions.get(sessionId)
      if (!session) {
        throw new Error(`Headless chat session was not found: ${sessionId}`)
      }
      const task = session.task
        ? await session.api.sendMessage(session.task, message)
        : await session.api.createTask(message, session.modelId)
      session.task = task
      if (task.status !== 'completed') {
        const error = task.events.find((event) => event.type === 'error')
        throw new Error(
          error?.message || `Chat task ended with status ${task.status}`,
        )
      }
      return task
    },
  }
}

export const headlessChatCommands = createHeadlessChatCommands()
