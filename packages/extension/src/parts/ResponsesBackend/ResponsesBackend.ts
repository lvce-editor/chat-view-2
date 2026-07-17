/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, regex/hoist-regex, sonarjs/no-nested-conditional, sonarjs/super-linear-regex, unicorn/prefer-iterator-to-array */
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
  readonly createWebSocket?: ResponsesWebSocketFactory
  readonly fetch?: typeof fetch
  readonly supportsStreaming?: boolean
}

interface ResponseEvent {
  readonly delta?: string
  readonly error?: unknown
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

interface ResponsesWebSocket {
  close(): void
  readonly onclose: ((event: CloseEvent) => void) | null
  readonly onerror: ((event: Event) => void) | null
  readonly onmessage: ((event: MessageEvent<unknown>) => void) | null
  readonly onopen: ((event: Event) => void) | null
  readonly readyState: number
  send(data: string): void
}

type MutableResponsesWebSocket = {
  -readonly [Key in keyof ResponsesWebSocket]: ResponsesWebSocket[Key]
}

type ResponsesWebSocketFactory = (
  url: string,
  protocols: readonly string[],
) => MutableResponsesWebSocket

const webSocketConnecting = 0
const webSocketOpen = 1
const loginRequiredMessage = 'You must log in to continue.'
const noAccessTokenProvidedCode = 'E_NO_ACCESS_TOKEN_PROVIDED'
const computerUseToolPrefix = 'computer_use_'
const defaultAgentInstructions =
  'You are the Lvce coding agent. Inspect relevant files before editing. Keep changes scoped, use tools to modify the workspace, run available verification, and end with a concise result. Treat every tool registered with the request as an available capability.'
const computerUseInstructions =
  'You have direct access to observe and control the local Linux desktop through the registered computer_use_* tools. You can launch installed desktop applications, inspect accessibility state and windows, take or save screenshots, focus apps, click, scroll, type text, and press keys. Do not say that computer use or GUI control is unavailable when these tools are registered. Invoke them like any other tool: start with computer_use_doctor when readiness is unknown. When an application must be opened, call computer_use_launch_app instead of using keyboard shortcuts or typing into an application launcher. Inspect windows or app state, prefer semantic accessibility selectors over pixel coordinates, and perform the requested action. When clicking coordinates from a window-cropped screenshot, pass the same window target and relative: true so the click uses the screenshot coordinate space. When a screenshot must be written to a path, call computer_use_save_screenshot because computer_use_screenshot does not save files. Inspect state again to verify the result. Ask before consequential actions that submit, send, purchase, delete, overwrite, or publish.'

class ResponsesBackendError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.code = code
    this.name = 'ResponsesBackendError'
  }
}

class WebSocketUpgradeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebSocketUpgradeError'
  }
}

const defaultCreateWebSocket: ResponsesWebSocketFactory = (url, protocols) =>
  new WebSocket(url, [...protocols])

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

const getAgentInstructions = (options: AgentStepOptions): string =>
  options.tools.some((tool) => tool.name.startsWith(computerUseToolPrefix))
    ? `${defaultAgentInstructions}\n\n${computerUseInstructions}`
    : defaultAgentInstructions

const createResponseRequest = (
  options: AgentStepOptions,
): Readonly<Record<string, unknown>> => ({
  input: options.input.map(mapInput),
  instructions: getAgentInstructions(options),
  model: options.modelId,
  ...(options.previousResponseId && {
    previous_response_id: options.previousResponseId,
  }),
  tools: options.tools.map((tool) => ({
    description: tool.description,
    name: tool.name,
    parameters: tool.inputSchema,
    type: 'function',
  })),
})

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

const getWebSocketUrl = (root: string, path: string): string => {
  const url = new URL(`${root}${path}`)
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  } else {
    throw new Error(`Unsupported backend URL protocol: ${url.protocol}`)
  }
  return url.href
}

const runWebSocketRequest = (
  root: string,
  accessToken: string | undefined,
  createWebSocket: ResponsesWebSocketFactory,
  options: AgentStepOptions,
  path: string,
): Promise<AgentStepResult> => {
  const { promise, reject, resolve } = Promise.withResolvers<AgentStepResult>()
  options.signal?.throwIfAborted()
  const protocol = 'lvce.responses.v1'
  const protocols = accessToken ? [protocol, accessToken] : [protocol]
  const socket = createWebSocket(getWebSocketUrl(root, path), protocols)
  const toolCalls = new Map<string, AgentToolCall>()
  let opened = false
  let processing = Promise.resolve()
  let responseId = ''
  let settled = false
  let text = ''

  const cleanup = (): void => {
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    socket.onopen = null
    options.signal?.removeEventListener('abort', handleAbort)
  }

  const closeSocket = (): void => {
    if (
      socket.readyState === webSocketConnecting ||
      socket.readyState === webSocketOpen
    ) {
      socket.close()
    }
  }

  const fail = (error: unknown): void => {
    if (settled) {
      return
    }
    settled = true
    cleanup()
    closeSocket()
    reject(error instanceof Error ? error : new Error(String(error)))
  }

  const complete = (): void => {
    if (settled) {
      return
    }
    settled = true
    cleanup()
    closeSocket()
    resolve({ responseId, text, toolCalls: [...toolCalls.values()] })
  }

  const handleAbort = (): void => {
    try {
      options.signal?.throwIfAborted()
    } catch (error) {
      fail(error)
    }
  }

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
      if (event.response && !text) {
        text = getResponseText(event.response)
      }
      if (event.response && toolCalls.size === 0) {
        for (const toolCall of getResponseToolCalls(event.response)) {
          toolCalls.set(toolCall.callId, toolCall)
        }
      }
      complete()
      return
    }
    if (event.type === 'response.failed' || event.type === 'error') {
      throw new Error(
        parseErrorMessage(event.error) ||
          event.response?.error?.message ||
          'The model request failed',
      )
    }
  }

  const processMessage = async (
    message: MessageEvent<unknown>,
  ): Promise<void> => {
    try {
      await processing
      if (settled) {
        return
      }
      if (typeof message.data !== 'string') {
        throw new TypeError(
          'The backend returned a non-text WebSocket response',
        )
      }
      let event: ResponseEvent
      try {
        event = JSON.parse(message.data) as ResponseEvent
      } catch {
        throw new Error('The backend returned invalid WebSocket JSON')
      }
      await handleEvent(event)
    } catch (error) {
      fail(error)
    }
  }

  const handleClose = async (event: CloseEvent): Promise<void> => {
    await processing
    if (settled) {
      return
    }
    const detail = event.reason ? `: ${event.reason}` : ''
    fail(
      opened
        ? new Error(`Model response stream closed before completion${detail}`)
        : new WebSocketUpgradeError(
            `Could not open the model response stream${detail}`,
          ),
    )
  }

  socket.onopen = () => {
    try {
      opened = true
      options.signal?.throwIfAborted()
      socket.send(
        JSON.stringify({
          ...createResponseRequest(options),
          type: 'response.create',
        }),
      )
    } catch (error) {
      fail(error)
    }
  }
  socket.onmessage = (message) => {
    processing = processMessage(message)
  }
  socket.onerror = () => {
    fail(
      opened
        ? new Error('The model response stream failed')
        : new WebSocketUpgradeError(
            'Could not connect to the model response stream',
          ),
    )
  }
  socket.onclose = (event) => {
    void handleClose(event)
  }
  options.signal?.addEventListener('abort', handleAbort, { once: true })
  return promise
}

const runWebSocketStep = async (
  root: string,
  accessToken: string | undefined,
  createWebSocket: ResponsesWebSocketFactory,
  options: AgentStepOptions,
): Promise<AgentStepResult> => {
  try {
    return await runWebSocketRequest(
      root,
      accessToken,
      createWebSocket,
      options,
      '/v1/responses',
    )
  } catch (error) {
    if (!(error instanceof WebSocketUpgradeError)) {
      throw error
    }
    return runWebSocketRequest(
      root,
      accessToken,
      createWebSocket,
      options,
      '/v1/realtime',
    )
  }
}

const getRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value && typeof value === 'object'
    ? (value as Readonly<Record<string, unknown>>)
    : undefined

const getResponseText = (
  response: Readonly<Record<string, unknown>>,
): string => {
  if (typeof response.output_text === 'string') {
    return response.output_text
  }
  if (!Array.isArray(response.output)) {
    return ''
  }
  const chunks: string[] = []
  for (const outputItem of response.output) {
    const item = getRecord(outputItem)
    if (item?.type !== 'message' || !Array.isArray(item.content)) {
      continue
    }
    for (const contentPart of item.content) {
      const part = getRecord(contentPart)
      if (
        (part?.type === 'output_text' || part?.type === 'text') &&
        typeof part.text === 'string'
      ) {
        chunks.push(part.text)
      }
    }
  }
  return chunks.join('')
}

const getResponseToolCalls = (
  response: Readonly<Record<string, unknown>>,
): readonly AgentToolCall[] => {
  if (!Array.isArray(response.output)) {
    return []
  }
  const toolCalls: AgentToolCall[] = []
  for (const outputItem of response.output) {
    const item = getRecord(outputItem)
    if (item?.type !== 'function_call' || typeof item.name !== 'string') {
      continue
    }
    const callId =
      typeof item.call_id === 'string'
        ? item.call_id
        : typeof item.id === 'string'
          ? item.id
          : `call-${toolCalls.length + 1}`
    toolCalls.push({
      arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
      callId,
      name: item.name,
    })
  }
  return toolCalls
}

const readResponse = async (response: Response): Promise<AgentStepResult> => {
  const value = getRecord(await response.json())
  if (!value) {
    throw new Error('The model returned an invalid response')
  }
  return {
    responseId: typeof value.id === 'string' ? value.id : '',
    text: getResponseText(value),
    toolCalls: getResponseToolCalls(value),
  }
}

export const createResponsesBackend = ({
  accessToken,
  baseUrl,
  createWebSocket = defaultCreateWebSocket,
  fetch: fetchImplementation = globalThis.fetch,
  supportsStreaming = false,
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
          response.status === 401 ? loginRequiredMessage : response.statusText
        const message =
          response.status === 401 && !accessToken
            ? loginRequiredMessage
            : await getErrorMessage(response, fallback)
        if (response.status === 401) {
          if (!accessToken) {
            throw new ResponsesBackendError(message, noAccessTokenProvidedCode)
          }
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
      if (supportsStreaming) {
        return runWebSocketStep(root, accessToken, createWebSocket, options)
      }
      const response = await fetchImplementation(`${root}/v1/responses`, {
        body: JSON.stringify({
          ...createResponseRequest(options),
          stream: false,
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
      return readResponse(response)
    },
  }
}
