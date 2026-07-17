/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { expect, jest, test } from '@jest/globals'
import { createResponsesBackend } from '../src/parts/ResponsesBackend/ResponsesBackend.ts'

class MockResponsesWebSocket {
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = 0
  readonly sent: string[] = []

  close(): void {
    this.readyState = 3
  }

  failConnection(): void {
    this.onerror?.(new Event('error'))
  }

  open(): void {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  receive(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent<string>)
  }

  send(data: string): void {
    this.sent.push(data)
  }
}

test('loads only OpenAI models from the authenticated catalog', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      {
        models: [
          { id: 'gpt-test', label: 'GPT Test', provider: 'openai' },
          { id: 'other-test', label: 'Other', provider: 'other' },
        ],
      },
      { status: 200 },
    ),
  )
  const backend = createResponsesBackend({
    accessToken: 'token',
    baseUrl: 'https://backend.example.com/',
    fetch: fetchMock,
  })

  await expect(backend.listModels()).resolves.toEqual([
    {
      available: true,
      id: 'gpt-test',
      label: 'GPT Test',
      planEligible: true,
    },
  ])
  expect(fetchMock).toHaveBeenCalledWith(
    'https://backend.example.com/v1/models',
    expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }),
  )
})

test('uses the backend message when loading models is unauthorized', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(
        { error: { message: 'Your session expired. Please log in again.' } },
        { status: 401 },
      ),
    )
  const backend = createResponsesBackend({
    accessToken: 'expired-token',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  await expect(backend.listModels()).rejects.toThrow(
    'Your session expired. Please log in again.',
  )
})

test('asks the user to log in when the access token is empty', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ error: 'No token provided' }, { status: 401 }),
    )
  const backend = createResponsesBackend({
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  await expect(backend.listModels()).rejects.toMatchObject({
    code: 'E_NO_ACCESS_TOKEN_PROVIDED',
    message: 'You must log in to continue.',
  })
})

test('uses the Responses WebSocket for streamed text and function calls', async () => {
  const fetchMock = jest.fn<typeof fetch>()
  const socket = new MockResponsesWebSocket()
  const createWebSocket = jest.fn(
    (_url: string, _protocols: readonly string[]) => socket,
  )
  const deltas: string[] = []
  const backend = createResponsesBackend({
    accessToken: 'access-token-123',
    baseUrl: 'https://backend.example.com',
    createWebSocket,
    fetch: fetchMock,
    supportsStreaming: true,
  })

  const resultPromise = backend.runStep({
    input: [
      { content: 'Inspect this repo', role: 'user' },
      {
        callId: 'call-screenshot',
        output: [
          {
            detail: 'original',
            image_url: 'data:image/png;base64,encoded-image',
            type: 'input_image',
          },
        ],
        type: 'function-call-output',
      },
    ],
    modelId: 'gpt-test',
    onTextDelta(delta) {
      deltas.push(delta)
    },
    tools: [],
  })
  socket.open()
  socket.receive({ delta: 'Inspecting ', type: 'response.output_text.delta' })
  socket.receive({ delta: 'now.', type: 'response.output_text.delta' })
  socket.receive({
    item: {
      arguments: '{"uri":"file:///workspace/package.json"}',
      call_id: 'call-1',
      name: 'read_file',
      type: 'function_call',
    },
    type: 'response.output_item.done',
  })
  socket.receive({ response: { id: 'response-1' }, type: 'response.completed' })
  const result = await resultPromise

  expect(deltas).toEqual(['Inspecting ', 'now.'])
  expect(result).toEqual({
    responseId: 'response-1',
    text: 'Inspecting now.',
    toolCalls: [
      {
        arguments: '{"uri":"file:///workspace/package.json"}',
        callId: 'call-1',
        name: 'read_file',
      },
    ],
  })
  expect(fetchMock).not.toHaveBeenCalled()
  expect(createWebSocket).toHaveBeenCalledWith(
    'wss://backend.example.com/v1/responses',
    ['lvce.responses.v1', 'access-token-123'],
  )
  expect(JSON.parse(socket.sent[0])).toEqual(
    expect.objectContaining({
      input: [
        {
          content: [{ text: 'Inspect this repo', type: 'input_text' }],
          role: 'user',
        },
        {
          call_id: 'call-screenshot',
          output: [
            {
              detail: 'original',
              image_url: 'data:image/png;base64,encoded-image',
              type: 'input_image',
            },
          ],
          type: 'function_call_output',
        },
      ],
      model: 'gpt-test',
      type: 'response.create',
    }),
  )
  expect(JSON.parse(socket.sent[0])).not.toHaveProperty('stream')
})

test('explicitly describes registered computer-use access to the agent', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 'response-computer-use',
      output: [],
    }),
  )
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  await backend.runStep({
    input: [{ content: 'Can you use the computer?', role: 'user' }],
    modelId: 'gpt-test',
    onTextDelta() {},
    tools: [
      {
        description: 'Inspect desktop readiness.',
        inputSchema: { properties: {}, type: 'object' },
        name: 'computer_use_doctor',
      },
    ],
  })

  const body = fetchMock.mock.calls[0][1]?.body
  if (typeof body !== 'string') {
    throw new TypeError('Expected a JSON request body')
  }
  const request = JSON.parse(body) as Readonly<Record<string, unknown>>
  expect(request.instructions).toEqual(
    expect.stringContaining(
      'You have direct access to observe and control the local Linux desktop',
    ),
  )
  expect(request.instructions).toEqual(
    expect.stringContaining('start with computer_use_doctor'),
  )
  expect(request.instructions).toEqual(
    expect.stringContaining(
      'Do not say that computer use or GUI control is unavailable',
    ),
  )
  expect(request.instructions).toEqual(
    expect.stringContaining('relative: true'),
  )
})

test('falls back to the realtime route when the responses upgrade fails', async () => {
  const modernSocket = new MockResponsesWebSocket()
  const fallbackSocket = new MockResponsesWebSocket()
  const sockets = [modernSocket, fallbackSocket]
  const createWebSocket = jest.fn(
    (_url: string, _protocols: readonly string[]) => {
      const socket = sockets.shift()
      if (!socket) {
        throw new Error('Unexpected WebSocket connection')
      }
      return socket
    },
  )
  const backend = createResponsesBackend({
    accessToken: 'access-token-123',
    baseUrl: 'https://backend.example.com',
    createWebSocket,
    supportsStreaming: true,
  })

  const result = backend.runStep({
    input: [{ content: 'Inspect this repo', role: 'user' }],
    modelId: 'gpt-test',
    onTextDelta() {},
    tools: [],
  })
  modernSocket.failConnection()
  const { promise, resolve } = Promise.withResolvers<void>()
  queueMicrotask(resolve)
  await promise
  fallbackSocket.open()
  fallbackSocket.receive({
    response: {
      id: 'response-legacy',
      output: [
        {
          content: [{ text: 'Legacy response.', type: 'output_text' }],
          type: 'message',
        },
      ],
    },
    type: 'response.completed',
  })

  await expect(result).resolves.toEqual({
    responseId: 'response-legacy',
    text: 'Legacy response.',
    toolCalls: [],
  })
  expect(createWebSocket).toHaveBeenNthCalledWith(
    1,
    'wss://backend.example.com/v1/responses',
    ['lvce.responses.v1', 'access-token-123'],
  )
  expect(createWebSocket).toHaveBeenNthCalledWith(
    2,
    'wss://backend.example.com/v1/realtime',
    ['lvce.responses.v1', 'access-token-123'],
  )
  expect(JSON.parse(fallbackSocket.sent[0])).toEqual(
    expect.objectContaining({
      model: 'gpt-test',
      type: 'response.create',
    }),
  )
  expect(JSON.parse(fallbackSocket.sent[0])).not.toHaveProperty('stream')
})

test('uses non-streaming responses unless streaming is explicitly supported', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 'response-2',
      output: [
        {
          content: [
            { text: 'Finished without streaming.', type: 'output_text' },
          ],
          type: 'message',
        },
        {
          arguments: '{"uri":"file:///workspace/package.json"}',
          call_id: 'call-2',
          name: 'read_file',
          type: 'function_call',
        },
      ],
    }),
  )
  const deltas: string[] = []
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  const result = await backend.runStep({
    input: [{ content: 'Inspect this repo', role: 'user' }],
    modelId: 'gpt-test',
    onTextDelta(delta) {
      deltas.push(delta)
    },
    tools: [],
  })

  expect(deltas).toEqual([])
  expect(result).toEqual({
    responseId: 'response-2',
    text: 'Finished without streaming.',
    toolCalls: [
      {
        arguments: '{"uri":"file:///workspace/package.json"}',
        callId: 'call-2',
        name: 'read_file',
      },
    ],
  })
  const body = fetchMock.mock.calls[0][1]?.body
  if (typeof body !== 'string') {
    throw new TypeError('Expected a JSON request body')
  }
  expect(JSON.parse(body)).toEqual(expect.objectContaining({ stream: false }))
})

test('surfaces backend errors without retrying unsafe work', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      { error: { message: 'Plan limit reached' } },
      {
        status: 429,
      },
    ),
  )
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  await expect(
    backend.runStep({
      input: [{ content: 'Work', role: 'user' }],
      modelId: 'gpt-test',
      onTextDelta() {},
      tools: [],
    }),
  ).rejects.toThrow('Plan limit reached')
})

test('surfaces backend WebSocket error messages', async () => {
  const socket = new MockResponsesWebSocket()
  const createWebSocket = jest.fn(() => socket)
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    createWebSocket,
    supportsStreaming: true,
  })

  const result = backend.runStep({
    input: [{ content: 'Work', role: 'user' }],
    modelId: 'gpt-test',
    onTextDelta() {},
    tools: [],
  })
  socket.open()
  socket.receive({
    error: { message: 'Monthly allowance exceeded' },
    status: 402,
    type: 'error',
  })

  await expect(result).rejects.toThrow('Monthly allowance exceeded')
  expect(createWebSocket).toHaveBeenCalledTimes(1)
})
