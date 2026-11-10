/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, regex/hoist-regex, sonarjs/no-nested-conditional, sonarjs/super-linear-regex, unicorn/prefer-iterator-to-array */
import type { AgentToolCall } from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import type {
  AgentBackend,
  AgentInput,
  AgentStepOptions,
  AgentStepResult,
} from '../AgentBackend/AgentBackend.ts'
import type {
  ChatAllowance,
  ChatImageAttachment,
  ChatModel,
  ChatTokenUsage,
} from '../ChatApi/ChatApi.ts'

export interface ResponsesBackendOptions {
  readonly accessToken?: string
  readonly baseUrl: string
  readonly createWebSocket?: ResponsesWebSocketFactory
  readonly fetch?: typeof fetch
  readonly onLoginRequired?: () => void
  readonly openAiWebSearch?: boolean
  readonly refreshAccessToken?: () => Promise<string>
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
    readonly usage?: unknown
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
const openRouterTooManyRequestsCode = 'E_OPENROUTER_TOO_MANY_REQUESTS'
const openRouterModelNotFoundCode = 'E_OPENROUTER_MODEL_NOT_FOUND'
const openRouterApiBadResponseCode = 'E_OPENROUTER_API_BAD_RESPONSE'
const computerUseToolPrefix = 'computer_use_'
const defaultAgentInstructions =
  'You are the Lvce assistant. Answer general questions directly. When the user asks you to work on an open workspace, inspect relevant files before editing, keep changes scoped, use tools to modify the workspace, and run available verification. If workspace context is unavailable, continue with requests that do not need workspace access and explain clearly when a requested operation requires an open workspace. Questions about files authorize reading and explanation; edit only when the user requests an implementation or change. Cite workspace evidence with Markdown links using the absolute file URI and a #L line number fragment. Keep the original workspace binding throughout a conversation. Clearly distinguish checks that ran from verification unavailable on this host. End with a concise result. Treat every tool registered with the request as an available capability.'
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
    content: [
      { text: input.content, type: 'input_text' },
      ...(input.attachments || []).map((attachment) => ({
        detail: 'auto',
        image_url: attachment.dataUrl,
        type: 'input_image',
      })),
    ],
    role: input.role,
  }
}

const getAgentInstructions = (options: AgentStepOptions): string =>
  options.tools.some((tool) => tool.name.startsWith(computerUseToolPrefix))
    ? `${defaultAgentInstructions}\n\n${computerUseInstructions}`
    : defaultAgentInstructions

const supportsImageGenerationTool = (modelId: string): boolean =>
  /^(?:openai\/)?gpt-[56](?:[.-]|$)/iu.test(modelId)

const requestsImageGeneration = (input: AgentStepOptions['input']): boolean =>
  input.some(
    (item) =>
      'role' in item &&
      item.role === 'user' &&
      /\b(?:image|picture|illustration|photo|artwork|drawing|logo|icon|draw|paint)\b/iu.test(
        item.content,
      ),
  )

const createResponseRequest = (
  options: AgentStepOptions,
  openAiWebSearch: boolean,
): Readonly<Record<string, unknown>> => ({
  input: options.input.map(mapInput),
  instructions: getAgentInstructions(options),
  ...(openAiWebSearch &&
    !options.modelId.toLowerCase().startsWith('openrouter/') && {
      include: ['web_search_call.action.sources'],
    }),
  model: options.modelId,
  ...(options.thinkingMode && { reasoning: { effort: options.thinkingMode } }),
  ...(options.previousResponseId && {
    previous_response_id: options.previousResponseId,
  }),
  tools: [
    ...options.tools.map((tool) => ({
      description: tool.description,
      name: tool.name,
      parameters: tool.inputSchema,
      type: 'function',
    })),
    ...(openAiWebSearch &&
    !options.modelId.toLowerCase().startsWith('openrouter/')
      ? [{ type: 'web_search' }]
      : []),
    ...(supportsImageGenerationTool(options.modelId) &&
    requestsImageGeneration(options.input)
      ? [{ model: 'gpt-image-2.5-sunburst', type: 'image_generation' }]
      : []),
  ],
})

const getRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value && typeof value === 'object'
    ? (value as Readonly<Record<string, unknown>>)
    : undefined

const getResponseImages = (response: {
  readonly output?: readonly unknown[]
}): readonly ChatImageAttachment[] => {
  if (!Array.isArray(response.output)) {
    return []
  }
  return response.output.flatMap((value, index) => {
    const item = getRecord(value)
    if (
      item?.type !== 'image_generation_call' ||
      typeof item.result !== 'string'
    ) {
      return []
    }
    const format =
      typeof item.output_format === 'string' ? item.output_format : 'png'
    const mimeType =
      format === 'jpeg'
        ? 'image/jpeg'
        : format === 'webp'
          ? 'image/webp'
          : 'image/png'
    return [
      {
        dataUrl: `data:${mimeType};base64,${item.result}`,
        mimeType,
        name: `Generated image ${index + 1}.${format === 'jpeg' ? 'jpg' : format}`,
      },
    ]
  })
}

const getResponseImageGenerationError = (response: {
  readonly output?: readonly unknown[]
}): string => {
  if (!Array.isArray(response.output)) {
    return ''
  }
  const failedImage = response.output
    .map(getRecord)
    .find(
      (item) =>
        item?.type === 'image_generation_call' &&
        typeof item.status === 'string' &&
        item.status !== 'completed' &&
        (item.status === 'failed' || typeof item.result !== 'string'),
    )
  if (!failedImage) {
    return ''
  }
  if (failedImage.status !== 'failed') {
    return `Image generation did not complete (status: ${failedImage.status}). The provider ended the response before returning an image.`
  }
  const error = getRecord(failedImage.error)
  const code = typeof error?.code === 'string' ? error.code : ''
  const message = typeof error?.message === 'string' ? error.message : ''
  const detail = [code, message].filter(Boolean).join(': ')
  return detail
    ? `Image generation failed (${detail}).`
    : 'Image generation failed.'
}

const appendImageGenerationError = (text: string, error: string): string => {
  if (!error) {
    return text
  }
  return text ? `${text}\n\n${error}` : error
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
    if (!['openai', 'openrouter'].includes(provider.toLowerCase())) {
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
        ...(Array.isArray(model.thinkingModes) && {
          thinkingModes: model.thinkingModes.filter(
            (mode): mode is 'low' | 'medium' | 'high' =>
              ['low', 'medium', 'high'].includes(mode as string),
          ),
        }),
      },
    ]
  })
}

const parseErrorDetails = (
  value: unknown,
): { readonly code?: string; readonly message: string } => {
  if (typeof value === 'string') {
    return { message: value }
  }
  if (!value || typeof value !== 'object') {
    return { message: '' }
  }
  const record = value as Readonly<Record<string, unknown>>
  const code = typeof record.code === 'string' ? record.code : undefined
  if (typeof record.error === 'string') {
    return { ...(code && { code }), message: record.error }
  }
  if (record.error && typeof record.error === 'object') {
    const error = record.error as Readonly<Record<string, unknown>>
    if (typeof error.message === 'string') {
      return { ...(code && { code }), message: error.message }
    }
  }
  return {
    ...(code && { code }),
    message: typeof record.message === 'string' ? record.message : '',
  }
}

const parseErrorMessage = (value: unknown): string =>
  parseErrorDetails(value).message

const getErrorDetails = async (
  response: Response,
  fallback = response.statusText,
): Promise<{ readonly code?: string; readonly message: string }> => {
  try {
    const details = parseErrorDetails(await response.json())
    return { ...details, message: details.message || fallback }
  } catch {
    return { message: fallback }
  }
}

const getErrorMessage = async (
  response: Response,
  fallback = response.statusText,
): Promise<string> => {
  const details = await getErrorDetails(response, fallback)
  return details.message
}

const getOpenRouterErrorMessage = (status: number): string | undefined => {
  if (status === 429) {
    return `OpenRouter is rate limiting requests. Please wait a moment and try again. (${openRouterTooManyRequestsCode}, 429)`
  }
  if (status === 404) {
    return `The selected OpenRouter model could not be found. Check the model name and try again. (${openRouterModelNotFoundCode}, 404)`
  }
  return undefined
}

const getModelRequestErrorMessage = async (
  response: Response,
  isOpenRouter: boolean,
): Promise<string> => {
  const details = await getErrorDetails(response)
  if (isOpenRouter && details.code === openRouterApiBadResponseCode) {
    return `${details.message} (${openRouterApiBadResponseCode}, ${response.status})`
  }
  const openRouterErrorMessage = isOpenRouter
    ? getOpenRouterErrorMessage(response.status)
    : undefined
  if (openRouterErrorMessage) {
    return openRouterErrorMessage
  }
  return `Model request failed (${response.status}): ${details.message}`
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

const getApiUrl = (root: string, path: string): string => {
  if (!root) {
    throw new Error(
      'Chat backend is not configured. Configure the LVCE backend to use chat.',
    )
  }
  const apiRoot = root.endsWith('/api') ? root : `${root}/api`
  return `${apiRoot}${path}`
}

const runWebSocketRequest = (
  root: string,
  accessToken: string | undefined,
  createWebSocket: ResponsesWebSocketFactory,
  options: AgentStepOptions,
  openAiWebSearch: boolean,
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
  let eventResponse: ResponseEvent['response']
  let usage: ChatTokenUsage | undefined
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
    const failure = error instanceof Error ? error : new Error(String(error))
    // A cancelled turn still owns its queued delta writes until they drain.
    // Rejecting sooner lets those writes race the stop state or the next turn.
    void processing.then(
      () => reject(failure),
      () => reject(failure),
    )
  }

  const complete = (): void => {
    if (settled) {
      return
    }
    settled = true
    cleanup()
    closeSocket()
    const images = eventResponse ? getResponseImages(eventResponse) : []
    resolve({
      responseId,
      text,
      toolCalls: [...toolCalls.values()],
      ...(images.length > 0 && { images }),
      ...(usage && { usage }),
    })
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
      eventResponse = event.response
      responseId = event.response?.id || responseId
      usage = parseTokenUsage(event.response?.usage)
      if (event.response) {
        text = getResponseText(event.response) || text
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
          ...createResponseRequest(options, openAiWebSearch),
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
  openAiWebSearch: boolean,
): Promise<AgentStepResult> => {
  try {
    return await runWebSocketRequest(
      root,
      accessToken,
      createWebSocket,
      options,
      openAiWebSearch,
      '/api/v1/responses',
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
      openAiWebSearch,
      '/api/v1/realtime',
    )
  }
}

const isTokenCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const parseTokenUsage = (value: unknown): ChatTokenUsage | undefined => {
  const usage = getRecord(value)
  if (
    !usage ||
    !isTokenCount(usage.input_tokens) ||
    !isTokenCount(usage.output_tokens)
  ) {
    return undefined
  }
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
}

const parseAllowance = (value: unknown): ChatAllowance => {
  const record = getRecord(value)
  if (!Array.isArray(record?.windows)) {
    throw new TypeError('Usage allowance returned an invalid response')
  }
  const windows = record.windows.map((value: unknown) => {
    const window = getRecord(value)
    if (
      !window ||
      typeof window.label !== 'string' ||
      !isTokenCount(window.limit) ||
      window.limit === 0 ||
      typeof window.remaining !== 'number' ||
      !Number.isFinite(window.remaining) ||
      window.remaining < 0 ||
      window.remaining > window.limit ||
      typeof window.resetAt !== 'string' ||
      !Number.isFinite(Date.parse(window.resetAt))
    ) {
      throw new Error('Usage allowance returned an invalid window')
    }
    return {
      label: window.label,
      limit: window.limit,
      remaining: window.remaining,
      resetAt: window.resetAt,
    }
  })
  return { windows }
}

const sourceTitleBrackets = /[\u{5B}\u{5D}]/gu
const feedLabels = new Map([
  ['oai-weather', 'OpenAI weather feed'],
  ['oai-finance', 'OpenAI finance feed'],
  ['oai-sports', 'OpenAI sports feed'],
])

const collectSearchSources = (
  item: Readonly<Record<string, unknown>>,
  feeds: Set<string>,
): void => {
  const action = getRecord(item.action)
  if (!Array.isArray(action?.sources)) {
    return
  }
  for (const entry of action.sources) {
    const source = getRecord(entry)
    if (source) {
      const label =
        feedLabels.get(String(source.name)) ||
        feedLabels.get(String(source.type)) ||
        feedLabels.get(String(source.url))
      if (label) {
        feeds.add(label)
      }
    }
  }
}

const getMessagePartText = (
  part: Readonly<Record<string, unknown>>,
): string => {
  const { annotations: annotationValue, text } = part
  if (typeof text !== 'string') {
    return ''
  }
  const annotations: readonly unknown[] = Array.isArray(annotationValue)
    ? annotationValue
    : []
  const citations: { end: number; markdown: string }[] = []
  for (const annotation of annotations) {
    const citation = getRecord(annotation)
    if (citation?.type !== 'url_citation') {
      continue
    }
    if (
      typeof citation.url !== 'string' ||
      !Number.isSafeInteger(citation.end_index) ||
      (citation.end_index as number) < 0 ||
      (citation.end_index as number) > text.length
    ) {
      continue
    }
    const url = new URL(citation.url)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      continue
    }
    const title =
      typeof citation.title === 'string'
        ? citation.title.replaceAll(sourceTitleBrackets, '')
        : url.hostname
    citations.push({
      end: citation.end_index as number,
      markdown: ` [${title}](${url.href.replaceAll('(', '%28').replaceAll(')', '%29')})`,
    })
  }
  const sortedCitations = citations.toSorted((a, b) => b.end - a.end)
  let result = text
  for (const { end, markdown } of sortedCitations) {
    result = `${result.slice(0, end)}${markdown}${result.slice(end)}`
  }
  return result
}

const collectMessageText = (
  item: Readonly<Record<string, unknown>>,
): string => {
  if (!Array.isArray(item.content)) {
    return ''
  }
  const chunks = item.content.map((value) => {
    const part = getRecord(value)
    return part?.type === 'output_text' || part?.type === 'text'
      ? getMessagePartText(part)
      : ''
  })
  return chunks.join('')
}

const getResponseText = (
  response: Readonly<Record<string, unknown>>,
): string => {
  const imageGenerationError = getResponseImageGenerationError(response)
  if (!Array.isArray(response.output)) {
    const text =
      typeof response.output_text === 'string' ? response.output_text : ''
    return appendImageGenerationError(text, imageGenerationError)
  }
  const feeds = new Set<string>()
  const chunks: string[] = []
  for (const value of response.output) {
    const item = getRecord(value)
    if (item?.type === 'web_search_call') {
      collectSearchSources(item, feeds)
    }
    if (item?.type === 'message') {
      chunks.push(collectMessageText(item))
    }
  }
  const text =
    chunks.join('') ||
    (typeof response.output_text === 'string' ? response.output_text : '')
  const references = [...feeds]
  const responseText =
    references.length > 0
      ? `${text}\n\nSources: ${references.join(', ')}`
      : text
  return appendImageGenerationError(responseText, imageGenerationError)
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
  const images = getResponseImages(value)
  return {
    ...(images.length > 0 && { images }),
    ...(parseTokenUsage(value.usage) && {
      usage: parseTokenUsage(value.usage),
    }),
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
  onLoginRequired,
  openAiWebSearch = true,
  refreshAccessToken,
  supportsStreaming = false,
}: ResponsesBackendOptions): AgentBackend => {
  const root = trimTrailingSlash(baseUrl)
  let currentAccessToken = accessToken
  let refreshPending: Promise<string> | undefined
  const requireLogin = (): never => {
    onLoginRequired?.()
    throw new ResponsesBackendError(
      loginRequiredMessage,
      noAccessTokenProvidedCode,
    )
  }
  const recoverAccessToken = async (
    rejectedToken: string | undefined,
  ): Promise<void> => {
    if (currentAccessToken && currentAccessToken !== rejectedToken) {
      return
    }
    const refresh = async (): Promise<string> => {
      try {
        return refreshAccessToken ? await refreshAccessToken() : ''
      } finally {
        refreshPending = undefined
      }
    }
    refreshPending ||= refresh()
    try {
      currentAccessToken = await refreshPending
    } catch {
      requireLogin()
    }
    if (!currentAccessToken) {
      requireLogin()
    }
  }
  const authenticatedFetch = async (
    url: string,
    init: RequestInit,
  ): Promise<Response> => {
    const rejectedToken = currentAccessToken
    let response = await fetchImplementation(url, {
      ...init,
      headers: getHeaders(currentAccessToken),
    })
    if (response.status === 401 && refreshAccessToken) {
      await recoverAccessToken(rejectedToken)
      init.signal?.throwIfAborted()
      response = await fetchImplementation(url, {
        ...init,
        headers: getHeaders(currentAccessToken),
      })
      if (response.status === 401) {
        requireLogin()
      }
    }
    return response
  }
  const runAuthenticatedWebSocket = async (
    options: AgentStepOptions,
  ): Promise<AgentStepResult> => {
    const rejectedToken = currentAccessToken
    try {
      return await runWebSocketStep(
        root,
        currentAccessToken,
        createWebSocket,
        options,
        openAiWebSearch,
      )
    } catch (error) {
      // Browser WebSocket errors hide the upgrade status. Confirm an auth
      // rejection with a read-only request before refreshing or retrying.
      if (!(error instanceof WebSocketUpgradeError) || !refreshAccessToken) {
        throw error
      }
      const probe = await fetchImplementation(getApiUrl(root, '/v1/models'), {
        credentials: 'include',
        headers: getHeaders(rejectedToken),
        ...(options.signal && { signal: options.signal }),
      })
      if (probe.status !== 401) {
        throw error
      }
      await recoverAccessToken(rejectedToken)
      options.signal?.throwIfAborted()
      try {
        return await runWebSocketStep(
          root,
          currentAccessToken,
          createWebSocket,
          options,
          openAiWebSearch,
        )
      } catch (retryError) {
        if (!(retryError instanceof WebSocketUpgradeError)) {
          throw retryError
        }
        const retryProbe = await fetchImplementation(
          getApiUrl(root, '/v1/models'),
          {
            credentials: 'include',
            headers: getHeaders(currentAccessToken),
            ...(options.signal && { signal: options.signal }),
          },
        )
        if (retryProbe.status === 401) {
          requireLogin()
        }
        throw retryError
      }
    }
  }
  return {
    async generateTitle(message, modelId) {
      const response = await authenticatedFetch(
        getApiUrl(root, '/v1/responses'),
        {
          body: JSON.stringify({
            input: [
              {
                content: [{ text: message, type: 'input_text' }],
                role: 'user',
              },
            ],
            instructions:
              'Create a concise, descriptive title for the user message. Correct spelling mistakes. Return only the title, with no quotes or explanation.',
            max_output_tokens: 40,
            model: modelId,
            store: false,
            stream: false,
            tools: [],
          }),
          credentials: 'include',
          method: 'POST',
        },
      )
      if (!response.ok) {
        throw new Error(await getModelRequestErrorMessage(response, false))
      }
      const result = await readResponse(response)
      if (result.toolCalls.length > 0) {
        throw new Error('Title generation returned an unexpected tool call')
      }
      return result.text
    },
    async getAllowance(modelId) {
      // OpenRouter uses the connected account's credits, not LVCE's allowance.
      if (modelId.startsWith('openrouter/')) {
        return undefined
      }
      const response = await authenticatedFetch(getApiUrl(root, '/v1/status'), {
        credentials: 'include',
      })
      if (response.status === 404) {
        return undefined
      }
      if (!response.ok) {
        throw new Error(`Could not load usage allowance (${response.status})`)
      }
      return parseAllowance(await response.json())
    },
    async listModels() {
      const response = await authenticatedFetch(getApiUrl(root, '/v1/models'), {
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
        throw new Error('The backend returned no available models')
      }
      return models
    },
    async runStep(options) {
      const isOpenRouter = options.modelId.startsWith('openrouter/')
      if (
        isOpenRouter &&
        options.previousResponseId &&
        !options.responseHistory
      ) {
        throw new Error(
          'OpenRouter conversation history is unavailable. Start a new chat.',
        )
      }
      const request = createResponseRequest(options, openAiWebSearch)
      const openRouterInput = isOpenRouter
        ? [...(options.responseHistory || []), ...options.input.map(mapInput)]
        : []
      if (supportsStreaming && !isOpenRouter) {
        return runAuthenticatedWebSocket(options)
      }
      const response = await authenticatedFetch(
        getApiUrl(root, '/v1/responses'),
        {
          body: JSON.stringify({
            ...request,
            ...(isOpenRouter && {
              input: openRouterInput,
              previous_response_id: undefined,
              store: false,
            }),
            stream: false,
          }),
          credentials: 'include',
          headers: getHeaders(accessToken),
          method: 'POST',
          ...(options.signal && { signal: options.signal }),
        },
      )
      if (!response.ok) {
        throw new Error(
          await getModelRequestErrorMessage(response, isOpenRouter),
        )
      }
      if (isOpenRouter) {
        const value = getRecord(await response.json())
        if (!value || !Array.isArray(value.output)) {
          throw new Error('OpenRouter returned an invalid response')
        }
        const images = getResponseImages(value)
        return {
          ...(images.length > 0 && { images }),
          responseHistory: [...openRouterInput, ...value.output],
          ...(parseTokenUsage(value.usage) && {
            usage: parseTokenUsage(value.usage),
          }),
          responseId: typeof value.id === 'string' ? value.id : '',
          text: getResponseText(value),
          toolCalls: getResponseToolCalls(value),
        }
      }
      return readResponse(response)
    },
  }
}
