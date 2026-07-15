/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types, sonarjs/cognitive-complexity */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { RecordedHttpResponse } from './Types.ts'
import {
  createCacheKey,
  readCachedResponse,
  writeCachedResponse,
} from './Cache.ts'
import {
  createTranscriptWriter,
  getToolCalls,
  getToolResults,
} from './Transcript.ts'

export interface EvaluationProxyOptions {
  readonly allowedOrigin?: string
  readonly apiKey?: string
  readonly cacheDirectory: string
  readonly host?: string
  readonly model: string
  readonly port?: number
  readonly scenarioId: string
  readonly temperature?: number
  readonly transcriptPath: string
  readonly upstreamBaseUrl: string
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
  try {
    const { hostname } = new URL(origin)
    return localHostnames.has(hostname)
  } catch {
    return false
  }
}

export const startEvaluationProxy = async (
  options: EvaluationProxyOptions,
): Promise<EvaluationProxy> => {
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
      if (request.method === 'OPTIONS') {
        response.statusCode = 204
        response.end()
        return
      }
      if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, { ok: true })
        return
      }
      if (request.method === 'GET' && request.url === '/v1/models') {
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
      if (request.method !== 'POST' || request.url !== '/v1/responses') {
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
      const cacheRequest = {
        body: requestBody,
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
        replayResponse(response, recorded)
        return
      }
      source = 'upstream'
      if (!options.apiKey) {
        sendJson(response, 502, {
          error: {
            message: `Evaluation cache miss ${cacheKey}. OPENAI_API_KEY is missing or empty; copy .env.example to the repository-root .env file and add a valid key to record new responses.`,
          },
        })
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
                'OpenAI rejected OPENAI_API_KEY. Update the key in the repository-root .env file and try again.',
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
        replayResponse(response, recorded)
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
        await writeCachedResponse(options.cacheDirectory, cacheKey, recorded)
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
      const closed = Promise.withResolvers<void>()
      server.close((error) => (error ? closed.reject(error) : closed.resolve()))
      return closed.promise
    },
    origin: `http://${options.host ?? '127.0.0.1'}:${address.port}`,
  }
}
