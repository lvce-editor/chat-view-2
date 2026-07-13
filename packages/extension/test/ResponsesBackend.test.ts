/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types */
import { expect, jest, test } from '@jest/globals'
import { createResponsesBackend } from '../src/parts/ResponsesBackend/ResponsesBackend.ts'

const createEventStream = (events: readonly unknown[]): ReadableStream => {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
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

test('parses streamed text and function calls from the Responses API', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(
      createEventStream([
        { delta: 'Inspecting ', type: 'response.output_text.delta' },
        { delta: 'now.', type: 'response.output_text.delta' },
        {
          item: {
            arguments: '{"path":"package.json"}',
            call_id: 'call-1',
            name: 'read_file',
            type: 'function_call',
          },
          type: 'response.output_item.done',
        },
        { response: { id: 'response-1' }, type: 'response.completed' },
      ]),
      { status: 200 },
    ),
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

  expect(deltas).toEqual(['Inspecting ', 'now.'])
  expect(result).toEqual({
    responseId: 'response-1',
    text: 'Inspecting now.',
    toolCalls: [
      {
        arguments: '{"path":"package.json"}',
        callId: 'call-1',
        name: 'read_file',
      },
    ],
  })
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

test('reconstructs an SSE event split across arbitrary stream chunks', async () => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode('data: {"delta":"fragmented","type":"response.output_'),
      )
      controller.enqueue(encoder.encode('text.delta"}\n\n'))
      controller.enqueue(
        encoder.encode(
          'data: {"response":{"id":"response-2"},"type":"response.completed"}',
        ),
      )
      controller.close()
    },
  })
  const backend = createResponsesBackend({
    baseUrl: 'https://backend.example.com',
    fetch: jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream, { status: 200 })),
  })

  await expect(
    backend.runStep({
      input: [{ content: 'Work', role: 'user' }],
      modelId: 'gpt-test',
      onTextDelta() {},
      tools: [],
    }),
  ).resolves.toEqual({
    responseId: 'response-2',
    text: 'fragmented',
    toolCalls: [],
  })
})
