/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
// cspell:words titlte
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

test('instructs the assistant to answer questions without requiring a workspace', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      error: null,
      id: 'response-1',
      object: 'response',
      output: [
        {
          content: [{ text: 'JSON is a data format.', type: 'output_text' }],
          role: 'assistant',
          status: 'completed',
          type: 'message',
        },
      ],
      status: 'completed',
    }),
  )
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  await backend.runStep({
    input: [
      {
        content: `Workspace context is unavailable: Workspace access is unavailable
Answer general questions without workspace access. Workspace tools require an open workspace.

User task:
whats json`,
        role: 'user',
      },
    ],
    modelId: 'gpt-test',
    onTextDelta() {},
    tools: [],
  })

  const requestBody = fetchMock.mock.calls[0]?.[1]?.body
  if (typeof requestBody !== 'string') {
    throw new TypeError('Expected a JSON request body')
  }
  const request = JSON.parse(requestBody) as Readonly<{
    readonly input: readonly Readonly<{
      readonly content: readonly Readonly<{ readonly text: string }>[]
    }>[]
    readonly instructions: string
  }>
  expect(request.instructions).toContain('Answer general questions directly.')
  expect(request.instructions).toContain(
    'continue with requests that do not need workspace access',
  )
  expect(request.input[0]?.content[0]?.text).toContain(
    'Answer general questions without workspace access.',
  )
})

test('generates a title with the selected model, a single message, and no tools', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 'response-title',
      output: [
        {
          content: [{ text: 'Fix Chat Title Typos', type: 'output_text' }],
          role: 'assistant',
          type: 'message',
        },
      ],
    }),
  )
  const backend = createResponsesBackend({
    accessToken: 'editor-token',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
    openAiWebSearch: true,
    supportsStreaming: true,
  })

  await expect(
    backend.generateTitle?.('fix typo in chat titlte', 'gpt-5.6-luna'),
  ).resolves.toBe('Fix Chat Title Typos')

  const requestBody = fetchMock.mock.calls[0]?.[1]?.body
  if (typeof requestBody !== 'string') {
    throw new TypeError('Expected a JSON request body')
  }
  const request = JSON.parse(requestBody) as Readonly<{
    readonly input: readonly Readonly<Record<string, unknown>>[]
    readonly instructions: string
    readonly max_output_tokens: number
    readonly model: string
    readonly tools: readonly unknown[]
  }>
  expect(request).toMatchObject({
    input: [
      {
        content: [{ text: 'fix typo in chat titlte', type: 'input_text' }],
        role: 'user',
      },
    ],
    max_output_tokens: 40,
    model: 'gpt-5.6-luna',
    store: false,
    tools: [],
  })
  expect(request.instructions).toContain('Return only the title')
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
    expect.objectContaining({ Authorization: 'Bearer editor-token' }),
  )
})

test('rejects title response tool calls without running them', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 'response-title-tool',
      output: [
        {
          arguments: '{}',
          call_id: 'call-1',
          name: 'run_command',
          type: 'function_call',
        },
      ],
    }),
  )
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  await expect(backend.generateTitle?.('hello', 'gpt-6-luna')).rejects.toThrow(
    'unexpected tool call',
  )
})

test('sends image attachments with their MIME-aware data URLs', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 'response-image',
      output: [],
      status: 'completed',
    }),
  )
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })
  const dataUrl = 'data:image/png;base64,aGVsbG8='

  await backend.runStep({
    input: [
      {
        attachments: [{ dataUrl, mimeType: 'image/png', name: 'sample.png' }],
        content: 'What is in this image?',
        role: 'user',
      },
    ],
    modelId: 'gpt-test',
    onTextDelta() {},
    tools: [],
  })

  const requestBody = fetchMock.mock.calls[0]?.[1]?.body
  if (typeof requestBody !== 'string') {
    throw new TypeError('Expected a JSON request body')
  }
  const request = JSON.parse(requestBody) as {
    input: readonly { content: readonly Readonly<Record<string, unknown>>[] }[]
  }
  expect(request.input[0]?.content).toEqual([
    { text: 'What is in this image?', type: 'input_text' },
    { detail: 'auto', image_url: dataUrl, type: 'input_image' },
  ])
})

test('enables OpenAI web search by default and omits it when disabled', async () => {
  for (const [openAiWebSearch, modelId, expectedTools] of [
    [true, 'gpt-test', [{ type: 'web_search' }]],
    [false, 'gpt-test', []],
    [true, 'openrouter/anthropic/claude', []],
  ] as const) {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'response-search', output: [] }))
    const backend = createResponsesBackend({
      baseUrl: 'https://backend.example.com',
      fetch: fetchMock,
      openAiWebSearch,
    })

    await backend.runStep({
      input: [{ content: 'What is current?', role: 'user' }],
      modelId,
      onTextDelta() {},
      tools: [
        {
          description: 'Read a file.',
          inputSchema: { properties: {}, type: 'object' },
          name: 'read_file',
        },
      ],
    })

    const body = fetchMock.mock.calls[0]?.[1]?.body
    if (typeof body !== 'string') {
      throw new TypeError('Expected a JSON request body')
    }
    const request = JSON.parse(body) as {
      readonly tools: readonly Readonly<Record<string, unknown>>[]
    }
    expect(request.tools).toEqual([
      {
        description: 'Read a file.',
        name: 'read_file',
        parameters: { properties: {}, type: 'object' },
        type: 'function',
      },
      ...expectedTools,
    ])
  }
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

test('refreshes and retries once when the backend rejects a stored token', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { code: 'E_INVALID_TOKEN', error: 'Invalid or expired token' },
        { status: 401 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({ models: [{ id: 'gpt-test' }] }, { status: 200 }),
    )
  const refreshAccessToken = jest.fn(async () => 'fresh-token')
  const backend = createResponsesBackend({
    accessToken: 'stale-token',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
    refreshAccessToken,
  })

  await expect(backend.listModels()).resolves.toEqual([
    {
      available: true,
      id: 'gpt-test',
      label: 'gpt-test',
      planEligible: true,
    },
  ])
  expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual(
    expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
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
  expect(JSON.parse(socket.sent[0]).tools).toEqual([{ type: 'web_search' }])
  expect(JSON.parse(socket.sent[0])).not.toHaveProperty('stream')
})

test('omits web search from Responses WebSocket requests when disabled', async () => {
  const socket = new MockResponsesWebSocket()
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    createWebSocket: () => socket,
    openAiWebSearch: false,
    supportsStreaming: true,
  })
  const resultPromise = backend.runStep({
    input: [{ content: 'Answer from model knowledge.', role: 'user' }],
    modelId: 'gpt-test',
    onTextDelta() {},
    tools: [],
  })

  socket.open()
  socket.receive({
    response: { id: 'response-no-search' },
    type: 'response.completed',
  })
  await resultPromise

  expect(JSON.parse(socket.sent[0] || '{}').tools).toEqual([])
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

test.each([
  [
    429,
    'OpenRouter is rate limiting requests. Please wait a moment and try again. (E_OPENROUTER_TOO_MANY_REQUESTS, 429)',
  ],
  [
    404,
    'The selected OpenRouter model could not be found. Check the model name and try again. (E_OPENROUTER_MODEL_NOT_FOUND, 404)',
  ],
])(
  'explains OpenRouter HTTP %s errors without duplicating the status',
  async (status, expected) => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          code: 'OPENROUTER_REQUEST_FAILED',
          error: `OpenRouter request failed (${status})`,
        },
        { status },
      ),
    )
    const backend = createResponsesBackend({
      baseUrl: 'https://backend.example.com',
      fetch: fetchMock,
    })

    await expect(
      backend.runStep({
        input: [{ content: 'Work', role: 'user' }],
        modelId: 'openrouter/vendor/model',
        onTextDelta() {},
        tools: [],
      }),
    ).rejects.toThrow(expected)
  },
)

test('surfaces the OpenRouter invalid response id diagnostic and code', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      {
        code: 'E_OPENROUTER_API_BAD_RESPONSE',
        error:
          "Openrouter reports request as invalid: [ApiIdParam] [previous_response_id] [invalid_id_prefix] Invalid 'previous_response_id': 'gen-123'. Expected an ID that begins with 'resp'.",
      },
      { status: 400 },
    ),
  )
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })

  await expect(
    backend.runStep({
      input: [{ content: 'Work', role: 'user' }],
      modelId: 'openrouter/vendor/model',
      onTextDelta() {},
      previousResponseId: 'gen-123',
      responseHistory: [{ content: 'Work', role: 'user' }],
      tools: [],
    }),
  ).rejects.toThrow(
    "Openrouter reports request as invalid: [ApiIdParam] [previous_response_id] [invalid_id_prefix] Invalid 'previous_response_id': 'gen-123'. Expected an ID that begins with 'resp'. (E_OPENROUTER_API_BAD_RESPONSE, 400)",
  )
})

test('keeps generic error handling for other providers', async () => {
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
  ).rejects.toThrow('Model request failed (429): Plan limit reached')
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

test('lists connected OpenRouter models alongside OpenAI models', async () => {
  const backend = createResponsesBackend({
    accessToken: 'lvce-token',
    baseUrl: 'https://backend.example.com',
    fetch: jest.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        models: [
          { id: 'gpt-test', provider: 'openai' },
          {
            id: 'openrouter/vendor/free:free',
            label: 'Free model (OpenRouter)',
            planEligible: true,
            provider: 'openrouter',
          },
        ],
      }),
    ),
  })
  const models = await backend.listModels()
  expect(models.map((model) => model.id)).toEqual([
    'gpt-test',
    'openrouter/vendor/free:free',
  ])
})

test('routes OpenRouter through backend HTTP and preserves tool history across turns', async () => {
  const toolCall = {
    arguments: '{}',
    call_id: 'call-1',
    name: 'read_file',
    type: 'function_call',
  }
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ id: 'response-1', output: [toolCall] }),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: 'response-2',
        output: [
          {
            content: [{ text: 'Done', type: 'output_text' }],
            role: 'assistant',
            type: 'message',
          },
        ],
      }),
    )
  const createWebSocket = jest.fn(() => new MockResponsesWebSocket())
  const backend = createResponsesBackend({
    accessToken: 'lvce-token',
    baseUrl: 'https://backend.example.com',
    createWebSocket,
    fetch: fetchMock,
    supportsStreaming: true,
  })
  const first = await backend.runStep({
    input: [{ content: 'Read the file', role: 'user' }],
    modelId: 'openrouter/vendor/free:free',
    onTextDelta: () => {},
    tools: [],
  })
  expect(first.toolCalls[0].callId).toBe('call-1')
  const second = await backend.runStep({
    input: [
      {
        callId: 'call-1',
        output: 'file content',
        type: 'function-call-output',
      },
    ],
    modelId: 'openrouter/vendor/free:free',
    onTextDelta: () => {},
    previousResponseId: first.responseId,
    ...(first.responseHistory && { responseHistory: first.responseHistory }),
    tools: [],
  })
  expect(createWebSocket).not.toHaveBeenCalled()
  expect(second.text).toBe('Done')
  expect(fetchMock.mock.calls[1][0]).toBe(
    'https://backend.example.com/v1/responses',
  )
  const request = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
  expect(request.previous_response_id).toBeUndefined()
  expect(request.store).toBe(false)
  expect(request.stream).toBe(false)
  expect(request.input).toEqual([
    { content: [{ text: 'Read the file', type: 'input_text' }], role: 'user' },
    toolCall,
    { call_id: 'call-1', output: 'file content', type: 'function_call_output' },
  ])
  expect(fetchMock.mock.calls[1][1]?.headers).toEqual(
    expect.objectContaining({ Authorization: 'Bearer lvce-token' }),
  )
})

test('does not silently lose an OpenRouter conversation whose history is unavailable', async () => {
  const fetchMock = jest.fn<typeof fetch>()
  const backend = createResponsesBackend({
    accessToken: 'token',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
  })
  await expect(
    backend.runStep({
      input: [{ content: 'Continue', role: 'user' }],
      modelId: 'openrouter/vendor/model',
      onTextDelta: () => {},
      previousResponseId: 'old-response',
      tools: [],
    }),
  ).rejects.toThrow('history is unavailable')
  expect(fetchMock).not.toHaveBeenCalled()
})

test.each(['missing', 'rejected', 'invalid'])(
  'requires Login after %s refresh without looping',
  async (failure) => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ error: 'Invalid token' }, { status: 401 }),
      )
    const refreshAccessToken = jest.fn(async () => {
      if (failure === 'rejected') {
        throw new Error('refresh denied')
      }
      return failure === 'missing' ? '' : 'also-invalid'
    })
    const onLoginRequired = jest.fn()
    const backend = createResponsesBackend({
      accessToken: 'rejected-token',
      baseUrl: 'https://backend.example.com',
      fetch: fetchMock,
      onLoginRequired,
      refreshAccessToken,
    })
    await expect(backend.listModels()).rejects.toMatchObject({
      code: 'E_NO_ACCESS_TOKEN_PROVIDED',
    })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(onLoginRequired).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(failure === 'invalid' ? 2 : 1)
  },
)

test('recovers a rejected WebSocket handshake without duplicating response.create', async () => {
  const sockets: MockResponsesWebSocket[] = []
  const createWebSocket = jest.fn(
    (_url: string, protocols: readonly string[]) => {
      const socket = new MockResponsesWebSocket()
      sockets.push(socket)
      queueMicrotask(() => {
        if (protocols[1] === 'stale') {
          socket.failConnection()
        } else {
          socket.open()
          socket.receive({
            response: { id: 'response-1' },
            type: 'response.completed',
          })
        }
      })
      return socket
    },
  )
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ error: 'Invalid token' }, { status: 401 }),
    )
  const refreshAccessToken = jest.fn(async () => 'fresh')
  const backend = createResponsesBackend({
    accessToken: 'stale',
    baseUrl: 'https://backend.example.com',
    createWebSocket,
    fetch: fetchMock,
    refreshAccessToken,
    supportsStreaming: true,
  })
  await expect(
    backend.runStep({
      input: [{ content: 'hello', role: 'user' }],
      modelId: 'gpt-test',
      onTextDelta() {},
      tools: [],
    }),
  ).resolves.toMatchObject({ responseId: 'response-1' })
  expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(sockets.flatMap((socket) => socket.sent)).toHaveLength(1)
})

test('does not refresh or resubmit after an opened stream fails', async () => {
  const socket = new MockResponsesWebSocket()
  const refreshAccessToken = jest.fn(async () => 'fresh')
  const fetchMock = jest.fn<typeof fetch>()
  const backend = createResponsesBackend({
    accessToken: 'token',
    baseUrl: 'https://backend.example.com',
    createWebSocket: () => socket,
    fetch: fetchMock,
    refreshAccessToken,
    supportsStreaming: true,
  })
  const result = backend.runStep({
    input: [{ content: 'hello', role: 'user' }],
    modelId: 'gpt-test',
    onTextDelta() {},
    tools: [],
  })
  socket.open()
  socket.failConnection()
  await expect(result).rejects.toThrow('The model response stream failed')
  expect(socket.sent).toHaveLength(1)
  expect(refreshAccessToken).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('retries an HTTP response request only after authentication rejection', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ error: 'invalid token' }, { status: 401 }),
    )
    .mockResolvedValueOnce(
      Response.json({ id: 'response-1', output_text: 'done' }),
    )
  const refreshAccessToken = jest.fn(async () => 'fresh')
  const backend = createResponsesBackend({
    accessToken: 'stale',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
    refreshAccessToken,
  })
  await expect(
    backend.runStep({
      input: [{ content: 'hello', role: 'user' }],
      modelId: 'gpt-test',
      onTextDelta() {},
      tools: [],
    }),
  ).resolves.toMatchObject({ text: 'done' })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[1][1]?.body).toBe(
    fetchMock.mock.calls[0][1]?.body,
  )
  expect(fetchMock.mock.calls[1][1]?.headers).toEqual(
    expect.objectContaining({ Authorization: 'Bearer fresh' }),
  )
})

test('does not resubmit a cancelled request after refreshing', async () => {
  const controller = new AbortController()
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({}, { status: 401 }))
  const backend = createResponsesBackend({
    accessToken: 'stale',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
    refreshAccessToken: async () => {
      controller.abort()
      return 'fresh'
    },
  })
  await expect(
    backend.runStep({
      input: [],
      modelId: 'gpt-test',
      onTextDelta() {},
      signal: controller.signal,
      tools: [],
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('coalesces simultaneous rejections and reuses the rotated token', async () => {
  const refresh = Promise.withResolvers<string>()
  const started = Promise.withResolvers<void>()
  const refreshAccessToken = jest.fn(() => {
    started.resolve()
    return refresh.promise
  })
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockImplementation(async (_url, options) => {
      return new Headers(options?.headers).get('Authorization') ===
        'Bearer fresh'
        ? Response.json({ models: [{ id: 'gpt-test' }] })
        : Response.json({}, { status: 401 })
    })
  const backend = createResponsesBackend({
    accessToken: 'stale',
    baseUrl: 'https://backend.example.com',
    fetch: fetchMock,
    refreshAccessToken,
  })
  const requests = Promise.all([backend.listModels(), backend.listModels()])
  await started.promise
  refresh.resolve('fresh')
  await requests
  expect(refreshAccessToken).toHaveBeenCalledTimes(1)
})

test('does not refresh on non-authentication WebSocket connection failures', async () => {
  const createWebSocket = jest.fn((): MockResponsesWebSocket => {
    const socket = new MockResponsesWebSocket()
    queueMicrotask(() => socket.failConnection())
    return socket
  })
  const refreshAccessToken = jest.fn(async () => 'fresh')
  const backend = createResponsesBackend({
    accessToken: 'token',
    baseUrl: 'https://backend.example.com',
    createWebSocket,
    fetch: jest
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ models: [] })),
    refreshAccessToken,
    supportsStreaming: true,
  })
  await expect(
    backend.runStep({
      input: [],
      modelId: 'gpt-test',
      onTextDelta() {},
      tools: [],
    }),
  ).rejects.toThrow('Could not connect')
  expect(refreshAccessToken).not.toHaveBeenCalled()
})
