import type { RawData, WebSocket } from 'ws'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types, sonarjs/cognitive-complexity */
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import type { RecordedHttpResponse } from './Types.ts'
import {
  createCacheKey,
  readCachedResponse,
  writeCachedResponse,
} from './Cache.ts'
import { normalizeCommandOutput } from './NormalizeCommandOutput.ts'
import { socketDataToText, recordWebSocketResponse } from './RecordWebSocket.ts'
import {
  createTranscriptWriter,
  getToolCalls,
  getToolResults,
} from './Transcript.ts'

export interface EvaluationProxyOptions {
  readonly allowedOrigin?: string
  readonly apiKey?: string
  readonly cacheDirectory: string
  readonly enableControls?: boolean
  readonly host?: string
  readonly mode?: 'record' | 'replay'
  readonly model: string
  readonly port?: number
  readonly scenarioId: string
  readonly temperature?: number
  readonly transcriptPath: string
  readonly upstreamBaseUrl: string
  readonly workspaceUri?: string
}

export interface EvaluationProxy {
  readonly close: () => Promise<void>
  readonly origin: string
}

const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]'])

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

const setCorsHeaders = (
  request: IncomingMessage,
  response: ServerResponse,
): void => {
  const origin = request.headers.origin || '*'
  response.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, content-type',
  )
  response.setHeader('Access-Control-Allow-Credentials', 'true')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
}

const sendJson = (
  response: ServerResponse,
  status: number,
  value: unknown,
): void => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(`${JSON.stringify(value)}\n`)
}

const replayResponse = (
  response: ServerResponse,
  recorded: RecordedHttpResponse,
): void => {
  response.statusCode = recorded.status
  for (const [name, value] of Object.entries(recorded.headers)) {
    response.setHeader(name, value)
  }
  response.end(recorded.body)
}

const getResponseHeaders = (
  headers: Headers,
): Readonly<Record<string, string>> => {
  const contentType = headers.get('content-type')
  return contentType ? { 'content-type': contentType } : {}
}

const trimTrailingSlashes = (value: string): string => {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') {
    end--
  }
  return value.slice(0, end)
}

const isAllowedOrigin = (
  origin: string | undefined,
  allowedOrigin: string | undefined,
): boolean => {
  if (!origin) {
    return true
  }
  if (allowedOrigin) {
    return origin === allowedOrigin
  }
  if (origin === 'null') {
    return true
  }
  if (!URL.canParse(origin)) {
    return false
  }
  const { hostname } = new URL(origin)
  return localHostnames.has(hostname)
}

const trailingSlash = /\/$/u
const controlPath = /^\/__replay\/(pause|resume)\/api\/v1\/models$/u
const controlPrefix = /^\/__replay\/(?:pause|resume)/u
const responseSocketPath =
  /^(?:\/__replay\/(?:pause|resume))?\/api\/v1\/responses$/u
const apiPath = /^\/api\//u
const eventSeparator = /\r?\n\r?\n/u
const lineSeparator = /\r?\n/u

const parseReplayEvents = (
  text: string,
  streamed: boolean,
): readonly unknown[] => {
  if (!streamed) {
    return [{ response: JSON.parse(text), type: 'response.completed' }]
  }
  return text.split(eventSeparator).flatMap((block) => {
    const data = block
      .split(lineSeparator)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    return data && data !== '[DONE]' ? [JSON.parse(data)] : []
  })
}

export const startEvaluationProxy = async (
  options: EvaluationProxyOptions,
): Promise<EvaluationProxy> => {
  let paused: ReturnType<typeof Promise.withResolvers<void>> | undefined
  const workspaceRoot = options.workspaceUri?.replace(trailingSlash, '')
  const portableRoot = 'memfs:///recorded-workspace'
  const portableWorkspacePath = '__LVCE_RECORDED_WORKSPACE_PATH__'
  const workspacePath = workspaceRoot?.startsWith('file://')
    ? JSON.stringify(fileURLToPath(workspaceRoot)).slice(1, -1)
    : undefined
  const commands = new Map<string, string>()
  const recordings = new Map<string, Promise<RecordedHttpResponse>>()
  const trackCommands = (recorded: RecordedHttpResponse): void => {
    for (const call of getToolCalls(recorded.body)) {
      if (call.name !== 'run_command') {
        continue
      }

      const args = JSON.parse(call.arguments) as { command?: unknown }
      if (typeof args.command === 'string') {
        commands.set(call.callId, args.command)
      }
    }
  }
  const normalize = (value: string): string => {
    const portable = workspaceRoot
      ? value.replaceAll(workspaceRoot, () => portableRoot)
      : value
    return workspacePath
      ? portable.replaceAll(workspacePath, () => portableWorkspacePath)
      : portable
  }

  const materialize = (
    recorded: RecordedHttpResponse,
  ): RecordedHttpResponse => {
    const body = workspaceRoot
      ? recorded.body.replaceAll(portableRoot, () => workspaceRoot)
      : recorded.body
    return {
      ...recorded,
      body: workspacePath
        ? body.replaceAll(portableWorkspacePath, () => workspacePath)
        : body,
    }
  }
  const portable = (recorded: RecordedHttpResponse): RecordedHttpResponse => ({
    ...recorded,
    body: normalize(recorded.body),
  })
  const transcript = createTranscriptWriter(
    options.transcriptPath,
    options.scenarioId,
    options.model,
    options.temperature,
  )
  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    if (!isAllowedOrigin(request.headers.origin, options.allowedOrigin)) {
      sendJson(response, 403, { error: { message: 'Origin is not allowed' } })
      return
    }
    setCorsHeaders(request, response)
    try {
      if (
        options.enableControls &&
        (request.method === 'POST' || request.method === 'GET') &&
        request.url === '/__replay/pause'
      ) {
        paused ||= Promise.withResolvers<void>()
        sendJson(response, 200, { paused: true })
        return
      }
      if (
        options.enableControls &&
        (request.method === 'POST' || request.method === 'GET') &&
        request.url === '/__replay/resume'
      ) {
        paused?.resolve()
        paused = undefined
        sendJson(response, 200, { paused: false })
        return
      }
      if (request.method === 'OPTIONS') {
        response.statusCode = 204
        response.end()
        return
      }
      if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, { ok: true })
        return
      }
      const control = options.enableControls
        ? controlPath.exec(request.url || '')
        : null
      if (control?.[1] === 'pause') {
        paused ||= Promise.withResolvers<void>()
      }
      if (control?.[1] === 'resume') {
        paused?.resolve()
        paused = undefined
      }
      // Keep a control URL usable if the view observes the temporary test preference.
      const route = options.enableControls
        ? request.url?.replace(controlPrefix, '')
        : request.url
      const pathname = control ? '/v1/models' : route?.replace(apiPath, '/')
      if (request.method === 'GET' && pathname === '/v1/models') {
        sendJson(response, 200, {
          data: [
            {
              available: true,
              id: options.model,
              label: `${options.model} (evaluation)`,
              planEligible: true,
              provider: 'openai',
            },
          ],
        })
        return
      }
      if (request.method !== 'POST' || pathname !== '/v1/responses') {
        sendJson(response, 404, { error: { message: 'Not found' } })
        return
      }

      const incomingBody = JSON.parse(await readBody(request)) as Readonly<
        Record<string, unknown>
      >
      const requestBody = {
        ...incomingBody,
        model: options.model,
        ...(options.temperature !== undefined && {
          temperature: options.temperature,
        }),
      }
      const normalizedBody = normalizeCommandOutput(requestBody, (id) =>
        commands.get(id),
      )
      const normalizedJson = normalize(JSON.stringify(normalizedBody))
      const cacheRequest = {
        body: JSON.parse(normalizedJson) as unknown,
        method: 'POST' as const,
        path: '/v1/responses' as const,
      }
      const cacheKey = createCacheKey(cacheRequest)
      let source: 'cache' | 'upstream' = 'cache'
      let recorded = await readCachedResponse(options.cacheDirectory, cacheKey)
      if (recorded) {
        await transcript.append({
          cacheKey,
          request: cacheRequest,
          response: recorded,
          source,
          toolCalls: getToolCalls(recorded.body),
          toolResults: getToolResults(requestBody),
        })
        trackCommands(recorded)
        replayResponse(response, materialize(recorded))
        return
      }
      if (options.mode !== 'record') {
        sendJson(response, 502, {
          error: {
            message: `Replay recording missing for ${options.scenarioId}: ${cacheKey}. Record this request explicitly; replay never contacts the provider.`,
          },
        })
        return
      }
      source = 'upstream'
      if (!options.apiKey) {
        sendJson(response, 502, {
          error: {
            message: `Evaluation cache miss ${cacheKey}. LVCE_ACCESS_TOKEN is missing or empty; copy .env.example to the repository-root .env file and add a valid LVCE backend token to record new responses.`,
          },
        })
        return
      }
      if (request.headers['x-chat-record-websocket'] === '1') {
        let recording = recordings.get(cacheKey)
        if (recording) {
          source = 'cache'
        } else {
          recording = (async (): Promise<RecordedHttpResponse> => {
            const result = await recordWebSocketResponse(
              options.upstreamBaseUrl,
              options.apiKey!,
              requestBody,
            )
            await writeCachedResponse(
              options.cacheDirectory,
              cacheKey,
              portable(result),
            )
            return result
          })()
          recordings.set(cacheKey, recording)
        }
        try {
          recorded = await recording
        } finally {
          if (recordings.get(cacheKey) === recording) {
            recordings.delete(cacheKey)
          }
        }
        await transcript.append({
          cacheKey,
          request: cacheRequest,
          response: recorded,
          source,
          toolCalls: getToolCalls(recorded.body),
          toolResults: getToolResults(requestBody),
        })
        trackCommands(recorded)
        replayResponse(response, materialize(recorded))
        return
      }
      const upstream = await fetch(
        `${trimTrailingSlashes(options.upstreamBaseUrl)}/responses`,
        {
          body: JSON.stringify(requestBody),
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      )
      if (upstream.status === 401 || upstream.status === 403) {
        await upstream.body?.cancel()
        recorded = {
          body: `${JSON.stringify({
            error: {
              message:
                'LVCE backend rejected LVCE_ACCESS_TOKEN. Update the token in the repository-root .env file and try again.',
            },
          })}\n`,
          headers: { 'content-type': 'application/json' },
          status: upstream.status,
        }
        await transcript.append({
          cacheKey,
          request: cacheRequest,
          response: recorded,
          source,
          toolCalls: [],
          toolResults: getToolResults(requestBody),
        })
        trackCommands(recorded)
        replayResponse(response, materialize(recorded))
        return
      }
      const headers = getResponseHeaders(upstream.headers)
      response.statusCode = upstream.status
      for (const [name, value] of Object.entries(headers)) {
        response.setHeader(name, value)
      }
      const chunks: Buffer[] = []
      if (upstream.body) {
        const reader = upstream.body.getReader()
        while (true) {
          const result = await reader.read()
          if (result.done) {
            break
          }
          const chunk = Buffer.from(result.value)
          chunks.push(chunk)
          response.write(chunk)
        }
      }
      recorded = {
        body: Buffer.concat(chunks).toString('utf8'),
        headers,
        status: upstream.status,
      }
      if (upstream.ok) {
        await writeCachedResponse(
          options.cacheDirectory,
          cacheKey,
          portable(recorded),
        )
      }
      await transcript.append({
        cacheKey,
        request: cacheRequest,
        response: recorded,
        source,
        toolCalls: getToolCalls(recorded.body),
        toolResults: getToolResults(requestBody),
      })
      response.end()
    } catch (error) {
      if (response.headersSent) {
        response.destroy(
          error instanceof Error ? error : new Error(String(error)),
        )
        return
      }
      sendJson(response, 500, {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }
  const server = createServer((request, response) => {
    void handleRequest(request, response)
  })

  const sockets = new WebSocketServer({
    handleProtocols: (protocols): string | false =>
      protocols.has('lvce.responses.v1') ? 'lvce.responses.v1' : false,
    noServer: true,
  })
  const replaySocketResponse = async (
    connection: WebSocket,
    data: Readonly<RawData>,
  ): Promise<void> => {
    const value = JSON.parse(socketDataToText(data)) as Record<string, unknown>
    if (value.type !== 'response.create') {
      throw new Error('Expected response.create')
    }
    const { type: _type, ...body } = value
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Replay server is not listening')
    }
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/responses`,
      {
        body: JSON.stringify({ ...body, stream: true }),
        headers: {
          'Content-Type': 'application/json',
          'x-chat-record-websocket': '1',
        },
        method: 'POST',
      },
    )
    const text = await response.text()
    if (!response.ok) {
      throw new Error(text)
    }
    const events = parseReplayEvents(
      text,
      response.headers.get('content-type')?.includes('text/event-stream') ===
        true,
    )
    await paused?.promise
    for (const event of events) {
      if (connection.readyState !== 1) {
        return
      }
      connection.send(JSON.stringify(event))
      await delay(2)
    }
  }
  const connect = (connection: WebSocket): void => {
    connection.once('message', (data: Readonly<RawData>) => {
      void replaySocketResponse(connection, data).catch((error: unknown) => {
        if (connection.readyState === 1) {
          connection.send(
            JSON.stringify({
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
              type: 'error',
            }),
          )
        }
      })
    })
  }
  server.on('upgrade', (request, socket, head) => {
    if (
      !isAllowedOrigin(request.headers.origin, options.allowedOrigin) ||
      !(options.enableControls
        ? responseSocketPath.test(request.url || '')
        : request.url === '/api/v1/responses')
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }
    sockets.handleUpgrade(request, socket, head, connect)
  })

  const started = Promise.withResolvers<void>()
  server.once('error', started.reject)
  server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
    server.off('error', started.reject)
    started.resolve()
  })
  await started.promise
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Evaluation proxy did not bind to a TCP port')
  }
  return {
    close: async (): Promise<void> => {
      paused?.resolve()
      const closed = Promise.withResolvers<void>()
      for (const connection of sockets.clients) {
        connection.terminate()
      }
      sockets.close()
      server.close((error) => (error ? closed.reject(error) : closed.resolve()))
      return closed.promise
    },
    origin: `http://${options.host ?? '127.0.0.1'}:${address.port}`,
  }
}
