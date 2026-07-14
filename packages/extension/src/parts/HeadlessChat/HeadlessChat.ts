import type { ChatApi, ChatTask, ChatTraceMessage } from '../ChatApi/ChatApi.ts'
import { createDefaultChatApi } from '../DefaultChatApi/DefaultChatApi.ts'

interface HeadlessChatSession {
  readonly api: ChatApi
  readonly modelId: string
  task?: ChatTask
  readonly trace: ChatTraceMessage[]
}

export interface HeadlessChatRunResult {
  readonly error?: string
  readonly sessionId: string
  readonly status: 'completed' | 'failed'
  readonly task?: ChatTask
  readonly trace: readonly ChatTraceMessage[]
}

export interface HeadlessChatCommands {
  readonly createSession: (requestedModelId?: unknown) => Promise<string>
  readonly runPrompt: (
    message: unknown,
    requestedModelId?: unknown,
  ) => Promise<HeadlessChatRunResult>
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

  const createSession = async (requestedModelId?: unknown): Promise<string> => {
    const api = await createChatApi()
    const models = await api.listModels()
    const modelId =
      typeof requestedModelId === 'string' ? requestedModelId.trim() : ''
    const model = modelId
      ? models.find(
          (item) => item.id === modelId && item.available && item.planEligible,
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
    sessions.set(id, { api, modelId: model.id, trace: [] })
    activeSessionId = id
    return id
  }

  const sendMessage = async (
    sessionIdOrMessage: unknown,
    messageValue?: unknown,
  ): Promise<ChatTask> => {
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
    const options = {
      onTrace(traceMessage: ChatTraceMessage): void {
        session.trace.push(traceMessage)
      },
    }
    const task = session.task
      ? await session.api.sendMessage(session.task, message, options)
      : await session.api.createTask(message, session.modelId, options)
    session.task = task
    if (task.status !== 'completed') {
      const error = task.events.find((event) => event.type === 'error')
      throw new Error(
        error?.message || `Chat task ended with status ${task.status}`,
      )
    }
    return task
  }

  const runPrompt = async (
    messageValue: unknown,
    requestedModelId?: unknown,
  ): Promise<HeadlessChatRunResult> => {
    let sessionId = ''
    try {
      const message = getString(messageValue, 'message')
      sessionId = await createSession(requestedModelId)
      const task = await sendMessage(sessionId, message)
      const session = sessions.get(sessionId)
      return {
        sessionId,
        status: 'completed',
        task,
        trace: session ? [...session.trace] : [],
      }
    } catch (error) {
      const session = sessions.get(sessionId)
      return {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        status: 'failed',
        ...(session?.task && { task: session.task }),
        trace: session ? [...session.trace] : [],
      }
    }
  }

  return {
    createSession,
    runPrompt,
    sendMessage,
  }
}

export const headlessChatCommands = createHeadlessChatCommands()
