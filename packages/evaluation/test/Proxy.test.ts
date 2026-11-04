/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { deepStrictEqual, rejects, strictEqual } from 'node:assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { EvaluationTranscript } from '../src/Types.ts'
import { startEvaluationProxy } from '../src/Proxy.ts'

const temporaryDirectories: string[] = []
const missingScenarioRecording = /Replay recording missing.*test-scenario/u
const missingCredentialRecording = /Replay recording missing.*replay-only/u

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((path) =>
      rm(path, { force: true, recursive: true }),
    ),
  )
  temporaryDirectories.length = 0
})

void test('records and replays response and tool data', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'chat-evaluation-'))
  temporaryDirectories.push(temporaryDirectory)
  const receivedBodies: unknown[] = []
  const responseBody = [
    'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call-1","name":"read_file","arguments":"{\\"path\\":\\"index.html\\"}"}}',
    '',
    'data: {"type":"response.completed","response":{"id":"response-1"}}',
    '',
  ].join('\n')
  const handleUpstreamRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk))
    }
    receivedBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    response.setHeader('Content-Type', 'text/event-stream')
    response.end(responseBody)
  }
  const upstream = createServer((request, response) => {
    void handleUpstreamRequest(request, response)
  })
  const listening = Promise.withResolvers<void>()
  upstream.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = upstream.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test upstream did not bind')
  }
  const transcriptPath = join(temporaryDirectory, 'result.json')
  const proxy = await startEvaluationProxy({
    allowedOrigin: 'https://editor.test',
    apiKey: 'test-key',
    cacheDirectory: join(temporaryDirectory, 'cache'),
    mode: 'record',
    model: 'test-model',
    scenarioId: 'test-scenario',
    transcriptPath,
    upstreamBaseUrl: `http://127.0.0.1:${address.port}/v1`,
  })
  const requestBody = {
    input: [
      {
        call_id: 'previous-call',
        output: 'file contents',
        type: 'function_call_output',
      },
    ],
    model: 'ignored-model',
    stream: true,
  }
  const send = (): Promise<Response> =>
    fetch(`${proxy.origin}/v1/responses`, {
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

  const modelsResponse = await fetch(`${proxy.origin}/v1/models`, {
    headers: { Origin: 'https://editor.test' },
  })
  strictEqual(
    modelsResponse.headers.get('access-control-allow-origin'),
    'https://editor.test',
  )
  strictEqual(
    modelsResponse.headers.get('access-control-allow-credentials'),
    'true',
  )

  const firstResponse = await send()
  strictEqual(await firstResponse.text(), responseBody)
  const secondResponse = await send()
  strictEqual(await secondResponse.text(), responseBody)
  strictEqual(receivedBodies.length, 1)
  deepStrictEqual(receivedBodies[0], {
    ...requestBody,
    model: 'test-model',
  })

  const transcript = JSON.parse(
    await readFile(transcriptPath, 'utf8'),
  ) as EvaluationTranscript
  strictEqual(transcript.exchanges.length, 2)
  strictEqual(transcript.exchanges[0].source, 'upstream')
  strictEqual(transcript.exchanges[1].source, 'cache')
  deepStrictEqual(transcript.exchanges[0].toolCalls, [
    {
      arguments: '{"path":"index.html"}',
      callId: 'call-1',
      name: 'read_file',
    },
  ])
  deepStrictEqual(transcript.exchanges[0].toolResults, [
    { callId: 'previous-call', output: 'file contents' },
  ])

  await proxy.close()
  const closed = Promise.withResolvers<void>()
  upstream.close((error) => (error ? closed.reject(error) : closed.resolve()))
  await closed.promise
})

void test('reports cache misses without making a paid request', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'chat-evaluation-'))
  temporaryDirectories.push(temporaryDirectory)
  const proxy = await startEvaluationProxy({
    cacheDirectory: join(temporaryDirectory, 'cache'),
    model: 'test-model',
    scenarioId: 'test-scenario',
    temperature: 0,
    transcriptPath: join(temporaryDirectory, 'result.json'),
    upstreamBaseUrl: 'http://127.0.0.1:1/v1',
  })
  const response = await fetch(`${proxy.origin}/v1/responses`, {
    body: JSON.stringify({ input: [], stream: true }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  strictEqual(response.status, 502)
  const body = (await response.json()) as {
    readonly error: { readonly message: string }
  }
  strictEqual(body.error.message.includes('Replay recording missing'), true)
  strictEqual(body.error.message.includes('explicitly'), true)
  await rejects(proxy.close(), missingScenarioRecording)
})

void test('reports an invalid LVCE token with .env guidance', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'chat-evaluation-'))
  temporaryDirectories.push(temporaryDirectory)
  const upstream = createServer((_request, response) => {
    response.statusCode = 401
    response.setHeader('Content-Type', 'application/json')
    response.end('{"error":{"message":"Incorrect API key"}}\n')
  })
  const listening = Promise.withResolvers<void>()
  upstream.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
  const address = upstream.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test upstream did not bind')
  }
  const proxy = await startEvaluationProxy({
    apiKey: 'invalid-key',
    cacheDirectory: join(temporaryDirectory, 'cache'),
    mode: 'record',
    model: 'test-model',
    scenarioId: 'test-scenario',
    temperature: 0,
    transcriptPath: join(temporaryDirectory, 'result.json'),
    upstreamBaseUrl: `http://127.0.0.1:${address.port}/v1`,
  })
  const response = await fetch(`${proxy.origin}/v1/responses`, {
    body: JSON.stringify({ input: [], stream: true }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  strictEqual(response.status, 401)
  const body = (await response.json()) as {
    readonly error: { readonly message: string }
  }
  strictEqual(body.error.message.includes('rejected LVCE_ACCESS_TOKEN'), true)
  strictEqual(body.error.message.includes('.env'), true)
  await proxy.close()
  const closed = Promise.withResolvers<void>()
  upstream.close((error) => (error ? closed.reject(error) : closed.resolve()))
  await closed.promise
})

void test('replay mode forbids upstream requests even with a valid credential configured', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'chat-replay-only-'))
  temporaryDirectories.push(temporaryDirectory)
  let requests = 0
  const upstream = createServer((_request, response) => {
    requests++
    response.end('{}')
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') {
    throw new Error('No upstream address')
  }
  const proxy = await startEvaluationProxy({
    apiKey: 'configured-credential',
    cacheDirectory: join(temporaryDirectory, 'cache'),
    model: 'test-model',
    scenarioId: 'replay-only',
    transcriptPath: join(temporaryDirectory, 'result.json'),
    upstreamBaseUrl: `http://127.0.0.1:${address.port}/v1`,
  })
  try {
    const response = await fetch(`${proxy.origin}/api/v1/responses`, {
      body: JSON.stringify({ input: [] }),
      method: 'POST',
    })
    strictEqual(response.status, 502)
    const text = await response.text()
    strictEqual(text.includes('Replay recording missing'), true)
    strictEqual(requests, 0)
  } finally {
    try {
      await rejects(proxy.close(), missingCredentialRecording)
    } finally {
      await new Promise<void>((resolve) => upstream.close(() => resolve()))
    }
  }
})

void test('replays recorded events over the production WebSocket protocol', async () => {
  const { createCacheKey, writeCachedResponse } =
    await import('../src/Cache.ts')
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'chat-replay-socket-'),
  )
  temporaryDirectories.push(temporaryDirectory)
  const body = {
    input: [{ content: 'Hello', role: 'user' }],
    model: 'test-model',
    stream: true,
  }
  const events = [
    { delta: 'Hello', type: 'response.output_text.delta' },
    { delta: ' there', type: 'response.output_text.delta' },
    { response: { id: 'resp-recorded' }, type: 'response.completed' },
  ]
  const cacheDirectory = join(temporaryDirectory, 'cache')
  await writeCachedResponse(
    cacheDirectory,
    createCacheKey({ body, method: 'POST', path: '/v1/responses' }),
    {
      body: events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(''),
      headers: { 'content-type': 'text/event-stream' },
      status: 200,
    },
  )
  const proxy = await startEvaluationProxy({
    cacheDirectory,
    model: 'test-model',
    scenarioId: 'socket',
    transcriptPath: join(temporaryDirectory, 'result.json'),
    upstreamBaseUrl: 'http://127.0.0.1:1/v1',
  })
  try {
    const socket = new WebSocket(
      `${proxy.origin.replace('http:', 'ws:')}/api/v1/responses`,
      ['lvce.responses.v1', 'test-token'],
    )
    const received: unknown[] = []
    await new Promise<void>((resolve, reject) => {
      socket.onopen = (): void =>
        socket.send(
          JSON.stringify({
            ...body,
            stream: undefined,
            type: 'response.create',
          }),
        )
      socket.onerror = (): void => reject(new Error('Socket failed'))
      socket.onmessage = (message: Readonly<MessageEvent>): void => {
        const event = JSON.parse(String(message.data)) as { type: string }
        received.push(event)
        if (event.type === 'error') {
          reject(new Error(JSON.stringify(event)))
        } else if (event.type === 'response.completed') {
          resolve()
        }
      }
    })
    socket.close()
    deepStrictEqual(received, events)
  } finally {
    await proxy.close()
  }
})

void test('coalesces concurrent identical recordings into one backend request', async () => {
  const { WebSocketServer } = await import('ws')
  const upstream = createServer()
  const sockets = new WebSocketServer({ server: upstream })
  let calls = 0
  sockets.on('connection', (socket) => {
    socket.once('message', () => {
      calls++
      setTimeout(
        () =>
          socket.send(
            JSON.stringify({
              response: { id: 'record-once' },
              type: 'response.completed',
            }),
          ),
        30,
      )
    })
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') {
    throw new Error('No upstream address')
  }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'chat-record-once-'))
  temporaryDirectories.push(temporaryDirectory)
  const proxy = await startEvaluationProxy({
    apiKey: 'test-token',
    cacheDirectory: join(temporaryDirectory, 'cache'),
    mode: 'record',
    model: 'test-model',
    scenarioId: 'record-once',
    transcriptPath: join(temporaryDirectory, 'result.json'),
    upstreamBaseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  })
  try {
    const responses = await Promise.all(
      [1, 2].map(async () => {
        const response = await fetch(`${proxy.origin}/v1/responses`, {
          body: JSON.stringify({ input: [], stream: true }),
          headers: { 'x-chat-record-websocket': '1' },
          method: 'POST',
        })
        strictEqual(response.status, 200)
        return response.text()
      }),
    )
    strictEqual(calls, 1)
    strictEqual(responses[0], responses[1])
  } finally {
    await proxy.close()
    for (const socket of sockets.clients) {
      socket.terminate()
    }
    sockets.close()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  }
})

void test('records portable workspace URIs upstream and replays them in another workspace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chat-portable-recording-'))
  temporaryDirectories.push(directory)
  const inputs: string[] = []
  const upstream = createServer((request, response) => {
    void (async (): Promise<void> => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        input: string
      }
      inputs.push(body.input)
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ text: body.input }))
    })()
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string')
    throw new Error('Expected upstream port')
  const proxies: Awaited<ReturnType<typeof startEvaluationProxy>>[] = []
  try {
    const workspaces = ['workspace-one', 'workspace-two'].map(
      (name) => pathToFileURL(join(directory, name)).href,
    )
    for (const [index, workspaceUri] of workspaces.entries()) {
      const proxy = await startEvaluationProxy({
        apiKey: 'test-key',
        cacheDirectory: join(directory, 'cache'),
        mode: index === 0 ? 'record' : 'replay',
        model: 'test-model',
        scenarioId: 'portable-workspace',
        transcriptPath: join(directory, `transcript-${index}.json`),
        upstreamBaseUrl: `http://127.0.0.1:${address.port}/v1`,
        workspaceUri,
      })
      proxies.push(proxy)
      const input = `${workspaceUri}/src/a.ts\ncwd: ${fileURLToPath(workspaceUri)}`
      const response = await fetch(`${proxy.origin}/v1/responses`, {
        body: JSON.stringify({ input }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      deepStrictEqual(await response.json(), {
        text: input,
      })
    }
    deepStrictEqual(inputs, [
      'memfs:///recorded-workspace/src/a.ts\ncwd: /recorded-workspace',
    ])
  } finally {
    await Promise.all(proxies.map((proxy) => proxy.close()))
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  }
})
