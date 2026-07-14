/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import type { EvaluationTranscript } from '../src/Types.ts'
import { startEvaluationProxy } from '../src/Proxy.ts'

const temporaryDirectories: string[] = []

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
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test upstream did not bind')
  }
  const transcriptPath = join(temporaryDirectory, 'result.json')
  const proxy = await startEvaluationProxy({
    allowedOrigin: 'https://editor.test',
    apiKey: 'test-key',
    cacheDirectory: join(temporaryDirectory, 'cache'),
    model: 'test-model',
    scenarioId: 'test-scenario',
    temperature: 0,
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
    temperature: 0,
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
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  )
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
  strictEqual(body.error.message.includes('set OPENAI_API_KEY'), true)
  await proxy.close()
})
