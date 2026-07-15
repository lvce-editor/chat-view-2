/* eslint-disable unicorn/max-nested-calls */
import { expect, jest, test } from '@jest/globals'
import type { AgentBackend } from '../src/parts/AgentBackend/AgentBackend.ts'
import type { AgentToolHost } from '../src/parts/AgentToolHost/AgentToolHost.ts'
import { createAgentChatApi } from '../src/parts/AgentChatApi/AgentChatApi.ts'
import { summarizeTask } from '../src/parts/ChatTask/ChatTask.ts'
import { createMemoryTaskStore } from '../src/parts/TaskStore/TaskStore.ts'

test('runs a multi-step tool loop and records a compact event history', async () => {
  const trace: unknown[] = []
  const runStep = jest
    .fn<AgentBackend['runStep']>()
    .mockResolvedValueOnce({
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
  expect(runStep).toHaveBeenCalledTimes(2)
  expect(runStep.mock.calls[1]?.[0].input).toEqual([
    {
      callId: 'call-1',
      output: '{"name":"repo"}',
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
