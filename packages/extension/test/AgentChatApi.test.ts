/* eslint-disable unicorn/max-nested-calls */
import { expect, jest, test } from '@jest/globals'
import type { AgentBackend } from '../src/parts/AgentBackend/AgentBackend.ts'
import type { AgentToolHost } from '../src/parts/AgentToolHost/AgentToolHost.ts'
import { createAgentChatApi } from '../src/parts/AgentChatApi/AgentChatApi.ts'
import { summarizeTask } from '../src/parts/ChatTask/ChatTask.ts'
import { createResponsesBackend } from '../src/parts/ResponsesBackend/ResponsesBackend.ts'
import { createMemoryTaskStore } from '../src/parts/TaskStore/TaskStore.ts'

test('runs a multi-step tool loop and records a compact event history', async () => {
  const trace: unknown[] = []
  const runStep = jest
    .fn<AgentBackend['runStep']>()
    .mockResolvedValueOnce({
      responseHistory: [
        { content: 'Read file', role: 'user' },
        {
          arguments: '{}',
          call_id: 'call-1',
          name: 'read_file',
          type: 'function_call',
        },
      ],
      responseId: 'response-1',
      text: '',
      toolCalls: [
        {
          arguments: '{"uri":"file:///workspace/package.json"}',
          callId: 'call-1',
          name: 'read_file',
        },
      ],
    })
    .mockResolvedValueOnce({
      responseHistory: [{ content: 'Finished', role: 'assistant' }],
      responseId: 'response-2',
      text: 'The repository is ready.',
      toolCalls: [],
    })
  const backend: AgentBackend = {
    async listModels() {
      return [
        {
          available: true,
          id: 'gpt-test',
          label: 'GPT Test',
          planEligible: true,
        },
      ]
    },
    runStep,
  }
  const execute = jest.fn<AgentToolHost['execute']>().mockResolvedValue({
    content: '{"name":"repo"}',
    isError: false,
    modelOutput: [
      {
        detail: 'original',
        image_url: 'data:image/png;base64,encoded-image',
        type: 'input_image',
      },
    ],
  })
  const toolHost: AgentToolHost = {
    beginTurn() {},
    execute,
    getChangedFiles() {
      return [
        {
          additions: 2,
          deletions: 1,
          path: 'package.json',
          status: 'modified',
        },
      ]
    },
    getDefinitions() {
      return []
    },
    async getWorkspaceContext() {
      return 'Workspace: file:///repo/'
    },
    async revert() {
      return []
    },
  }
  const api = createAgentChatApi({
    backend,
    store: createMemoryTaskStore(),
    toolHost,
  })

  const task = await api.createTask('Inspect this repo', 'gpt-test', {
    onTrace(message) {
      trace.push(message)
    },
  })

  expect(task.status).toBe('completed')
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'read_file' }),
    undefined,
  )
  expect(runStep.mock.calls[1]?.[0].responseHistory).toEqual([
    { content: 'Read file', role: 'user' },
    {
      arguments: '{}',
      call_id: 'call-1',
      name: 'read_file',
      type: 'function_call',
    },
  ])
  expect(task.responseHistory).toEqual([
    { content: 'Finished', role: 'assistant' },
  ])
  const restoredTask = await api.getTask(task.id)
  expect(restoredTask?.responseHistory).toEqual(task.responseHistory)
  expect(runStep).toHaveBeenCalledTimes(2)
  expect(runStep.mock.calls[1]?.[0].input).toEqual([
    {
      callId: 'call-1',
      output: [
        {
          detail: 'original',
          image_url: 'data:image/png;base64,encoded-image',
          type: 'input_image',
        },
      ],
      type: 'function-call-output',
    },
  ])
  expect(summarizeTask(task)).toEqual(
    expect.objectContaining({
      changedFiles: [
        {
          additions: 2,
          deletions: 1,
          path: 'package.json',
          status: 'modified',
        },
      ],
      messages: expect.arrayContaining([
        expect.objectContaining({ text: 'The repository is ready.' }),
      ]),
    }),
  )
  expect(trace).toEqual([
    expect.objectContaining({
      content: 'Inspect this repo',
      role: 'user',
    }),
    expect.objectContaining({
      content: [
        {
          arguments: { uri: 'file:///workspace/package.json' },
          id: 'call-1',
          name: 'read_file',
          type: 'toolCall',
        },
      ],
      model: 'gpt-test',
      responseId: 'response-1',
      role: 'assistant',
    }),
    expect.objectContaining({
      content: [{ text: '{"name":"repo"}', type: 'text' }],
      isError: false,
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'read_file',
    }),
    expect.objectContaining({
      content: [{ text: 'The repository is ready.', type: 'text' }],
      model: 'gpt-test',
      responseId: 'response-2',
      role: 'assistant',
    }),
  ])
})

test('records a failed task when the backend rejects the request', async () => {
  const backend: AgentBackend = {
    async listModels() {
      return []
    },
    async runStep() {
      throw new Error('Backend unavailable')
    },
  }
  const toolHost: AgentToolHost = {
    beginTurn() {},
    async execute() {
      return { content: '', isError: false }
    },
    getChangedFiles() {
      return []
    },
    getDefinitions() {
      return []
    },
    async getWorkspaceContext() {
      return 'Workspace'
    },
    async revert() {
      return []
    },
  }
  const api = createAgentChatApi({
    backend,
    store: createMemoryTaskStore(),
    toolHost,
  })

  const task = await api.createTask('Work', 'gpt-test')

  expect(task.status).toBe('failed')
  expect(summarizeTask(task).errorMessage).toBe('Backend unavailable')
})

test('returns automatic verification failures to the model for repair', async () => {
  const runStep = jest
    .fn<AgentBackend['runStep']>()
    .mockResolvedValueOnce({
      responseId: 'response-1',
      text: '',
      toolCalls: [
        {
          arguments:
            '{"uri":"file:///workspace/src/a.ts","oldText":"a","newText":"b"}',
          callId: 'call-1',
          name: 'apply_patch',
        },
      ],
    })
    .mockResolvedValueOnce({
      responseId: 'response-2',
      text: 'Done before verification.',
      toolCalls: [],
    })
    .mockResolvedValueOnce({
      responseId: 'response-3',
      text: 'Repaired and verified.',
      toolCalls: [],
    })
  const verifyChanges = jest
    .fn<NonNullable<AgentToolHost['verifyChanges']>>()
    .mockResolvedValueOnce({
      checksPassed: 0,
      failed: true,
      output: 'type-check failed',
    })
    .mockResolvedValueOnce({
      checksPassed: 2,
      failed: false,
      output: 'type-check and tests passed',
    })
  const backend: AgentBackend = {
    async listModels() {
      return []
    },
    runStep,
  }
  const toolHost: AgentToolHost = {
    beginTurn() {},
    async execute() {
      return { content: 'Updated src/a.ts', isError: false }
    },
    getChangedFiles() {
      return [
        {
          additions: 1,
          deletions: 1,
          path: 'src/a.ts',
          status: 'modified',
        },
      ]
    },
    getDefinitions() {
      return []
    },
    async getWorkspaceContext() {
      return 'Workspace'
    },
    async revert() {
      return []
    },
    verifyChanges,
  }
  const api = createAgentChatApi({
    backend,
    store: createMemoryTaskStore(),
    toolHost,
  })

  const task = await api.createTask('Fix it', 'gpt-test')
  const summary = summarizeTask(task)

  expect(runStep).toHaveBeenCalledTimes(3)
  expect(runStep.mock.calls[2]?.[0].input).toEqual([
    expect.objectContaining({
      content: expect.stringContaining('type-check failed'),
    }),
  ])
  expect(summary.messages.map((message) => message.text)).not.toContain(
    'Done before verification.',
  )
  expect(summary.messages.map((message) => message.text)).toContain(
    'Repaired and verified.',
  )
  expect(summary.checksPassed).toBe(2)
})

test('clears an earlier OpenRouter error when a Nemotron follow-up succeeds', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json(
        { error: 'Invalid response from OpenRouter' },
        { status: 502 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: 'nemotron-response',
        object: 'response',
        status: 'completed',
        error: null,
        output: [
          {
            type: 'reasoning',
            content: [{ type: 'reasoning_text', text: 'Compute the sum.' }],
            summary: [],
            format: 'unknown',
          },
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: '2+2 is **4**.',
                annotations: [],
                logprobs: [],
              },
            ],
          },
        ],
      }),
    )
  const store = createMemoryTaskStore()
  const api = createAgentChatApi({
    backend: createResponsesBackend({
      baseUrl: 'https://backend.example.com',
      fetch: fetchMock,
    }),
    store,
    toolHost: {
      beginTurn() {},
      async execute() {
        return { content: '', isError: false }
      },
      getChangedFiles() {
        return []
      },
      getDefinitions() {
        return []
      },
      async getWorkspaceContext() {
        return 'Workspace'
      },
      async revert() {
        return []
      },
    },
  })
  const failed = await api.createTask(
    '1+1',
    'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
  )
  expect(failed.status).toBe('failed')
  expect(summarizeTask(failed).errorMessage).toBe(
    'Model request failed (502): Invalid response from OpenRouter',
  )
  const completed = await api.sendMessage(failed, '2+2')
  expect(completed.status).toBe('completed')
  expect(summarizeTask(completed).messages.at(-1)?.text).toBe('2+2 is **4**.')
  expect(summarizeTask(completed).errorMessage).toBe('')
  expect(completed.events.some((event) => event.type === 'error')).toBe(true)
  expect(summarizeTask((await store.get(completed.id))!).errorMessage).toBe('')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
