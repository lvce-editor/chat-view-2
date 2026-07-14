/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, regex/hoist-regex, sonarjs/no-nested-conditional, sonarjs/super-linear-regex, unicorn/no-break-in-nested-loop, unicorn/prefer-iterator-to-array */
import type {
  AgentBackend,
  AgentInput,
  AgentStepOptions,
  AgentStepResult,
} from '../AgentBackend/AgentBackend.ts'
import type { AgentToolCall } from '../AgentToolHost/AgentToolHost.ts'
import type { ChatModel } from '../ChatApi/ChatApi.ts'

export interface ResponsesBackendOptions {
  readonly accessToken?: string
  readonly baseUrl: string
  readonly fetch?: typeof fetch
}

interface ResponseEvent {
  readonly delta?: string
  readonly item?: {
    readonly arguments?: string
    readonly call_id?: string
    readonly id?: string
    readonly name?: string
    readonly type?: string
  }
  readonly response?: {
    readonly error?: { readonly message?: string }
    readonly id?: string
    readonly output?: readonly unknown[]
  }
  readonly type?: string
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

const getHeaders = (accessToken?: string): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
})

const mapInput = (input: AgentInput): Readonly<Record<string, unknown>> => {
  if ('output' in input) {
    return {
      call_id: input.callId,
      output: input.output,
      type: 'function_call_output',
    }
  }
  return {
    content: [{ text: input.content, type: 'input_text' }],
    role: input.role,
  }
}

const parseModels = (value: unknown): readonly ChatModel[] => {
  if (!value || typeof value !== 'object') {
    throw new Error('Model catalog returned an invalid response')
  }
  const record = value as Readonly<Record<string, unknown>>
  const items = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : []
  return items.flatMap((item): readonly ChatModel[] => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const model = item as Readonly<Record<string, unknown>>
    if (typeof model.id !== 'string') {
      return []
    }
    const provider =
      typeof model.provider === 'string' ? model.provider : 'openai'
    if (provider.toLowerCase() !== 'openai') {
      return []
    }
    return [
      {
        available: model.available !== false,
        id: model.id,
        label:
          typeof model.label === 'string'
            ? model.label
            : typeof model.name === 'string'
              ? model.name
              : model.id,
        planEligible: model.planEligible !== false,
      },
    ]
  })
}

const parseErrorMessage = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (!value || typeof value !== 'object') {
    return ''
  }
  const record = value as Readonly<Record<string, unknown>>
  if (typeof record.error === 'string') {
    return record.error
  }
  if (record.error && typeof record.error === 'object') {
    const error = record.error as Readonly<Record<string, unknown>>
    if (typeof error.message === 'string') {
      return error.message
    }
  }
  return typeof record.message === 'string' ? record.message : ''
}

const getErrorMessage = async (
  response: Response,
  fallback = response.statusText,
): Promise<string> => {
  try {
    return parseErrorMessage(await response.json()) || fallback
  } catch {
    return fallback
  }
}

const readEvents = async (
  response: Response,
  options: AgentStepOptions,
): Promise<AgentStepResult> => {
  if (!response.body) {
    throw new Error('The response stream was empty')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const toolCalls = new Map<string, AgentToolCall>()
  let buffer = ''
  let responseId = ''
  let text = ''

  const handleEvent = async (event: ResponseEvent): Promise<void> => {
    if (event.type === 'response.output_text.delta' && event.delta) {
      text += event.delta
      await options.onTextDelta(event.delta)
      return
    }
    const { item } = event
    if (
      event.type === 'response.output_item.done' &&
      item?.type === 'function_call' &&
      item.name
    ) {
      const callId = item.call_id || item.id || `call-${toolCalls.size + 1}`
      toolCalls.set(callId, {
        arguments: item.arguments || '{}',
        callId,
        name: item.name,
      })
      return
    }
    if (event.type === 'response.completed') {
      responseId = event.response?.id || responseId
      return
    }
    if (event.type === 'response.failed' || event.type === 'error') {
      throw new Error(
        event.response?.error?.message || 'The model request failed',
      )
    }
  }

  while (true) {
    options.signal?.throwIfAborted()
    const result = await reader.read()
    buffer += decoder.decode(result.value, { stream: !result.done })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') {
        continue
      }
      await handleEvent(JSON.parse(data) as ResponseEvent)
    }
    if (result.done) {
      break
    }
  }
  if (buffer.trim()) {
    const data = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data && data !== '[DONE]') {
      await handleEvent(JSON.parse(data) as ResponseEvent)
    }
  }
  return { responseId, text, toolCalls: [...toolCalls.values()] }
}

export const createResponsesBackend = ({
  accessToken,
  baseUrl,
  fetch: fetchImplementation = globalThis.fetch,
}: ResponsesBackendOptions): AgentBackend => {
  const root = trimTrailingSlash(baseUrl)
  return {
    async listModels() {
      const response = await fetchImplementation(`${root}/v1/models`, {
        credentials: 'include',
        headers: getHeaders(accessToken),
      })
      if (!response.ok) {
        const fallback =
          response.status === 401
            ? 'Log in to access the chat.'
            : response.statusText
        const message = await getErrorMessage(response, fallback)
        if (response.status === 401) {
          throw new Error(message)
        }
        throw new Error(
          `Could not load models (${response.status}): ${message}`,
        )
      }
      const models = parseModels(await response.json())
      if (models.length === 0) {
        throw new Error('The backend returned no OpenAI models')
      }
      return models
    },
    async runStep(options) {
      const response = await fetchImplementation(`${root}/v1/responses`, {
        body: JSON.stringify({
          input: options.input.map(mapInput),
          instructions:
            'You are the Lvce coding agent. Inspect relevant files before editing. Keep changes scoped, use tools to modify the workspace, run available verification, and end with a concise result.',
          model: options.modelId,
          ...(options.previousResponseId && {
            previous_response_id: options.previousResponseId,
          }),
          stream: true,
          tools: options.tools.map((tool) => ({
            description: tool.description,
            name: tool.name,
            parameters: tool.inputSchema,
            type: 'function',
          })),
        }),
        credentials: 'include',
        headers: getHeaders(accessToken),
        method: 'POST',
        ...(options.signal && { signal: options.signal }),
      })
      if (!response.ok) {
        throw new Error(
          `Model request failed (${response.status}): ${await getErrorMessage(response)}`,
        )
      }
      return readEvents(response, options)
    },
  }
}
