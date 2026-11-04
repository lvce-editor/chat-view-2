import type {
  AgentFileSystem,
  AgentToolCall,
} from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import { expect, jest, test } from '@jest/globals'
import { createAgentToolHost } from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import { createResponsesBackend } from '../src/parts/ResponsesBackend/ResponsesBackend.ts'

test('missing backend configuration cannot look like a successful chat', async () => {
  const fetch = jest.fn<typeof globalThis.fetch>()
  const backend = createResponsesBackend({ baseUrl: '', fetch })
  await expect(backend.listModels()).rejects.toThrow(
    'backend is not configured',
  )
  expect(fetch).not.toHaveBeenCalled()
})

test('a task must re-read a file changed by another task before editing', async () => {
  let content = 'left right'
  const fileSystem: AgentFileSystem = {
    exists: async () => true,
    readDirWithFileTypes: async () => [{ name: 'file.txt', type: 7 }],
    readFile: async () => content,
    remove: async () => {},
    writeFile: async (_uri: string, value: string) => {
      content = value
    },
  }
  const options = {
    fileSystem,
    workspaceUriProvider: async (): Promise<string> => 'memfs:///project/',
  }
  const first = createAgentToolHost(options)
  const second = createAgentToolHost(options)
  const uri = 'memfs:///project/file.txt'
  const read = {
    arguments: JSON.stringify({ uri }),
    callId: 'read',
    name: 'read_file',
  }
  await first.execute(read)
  await second.execute(read)
  const patch = (oldText: string, newText: string): AgentToolCall => ({
    arguments: JSON.stringify({ newText, oldText, uri }),
    callId: 'edit',
    name: 'apply_patch',
  })
  const firstEdit = await first.execute(patch('left', 'LEFT'))
  expect(firstEdit.isError).toBe(false)
  const staleEdit = await second.execute(patch('right', 'RIGHT'))
  expect(staleEdit.isError).toBe(true)
  expect(content).toBe('LEFT right')
  await second.execute(read)
  const freshEdit = await second.execute(patch('right', 'RIGHT'))
  expect(freshEdit.isError).toBe(false)
  expect(content).toBe('LEFT RIGHT')
})

import type { AgentBackend } from '../src/parts/AgentBackend/AgentBackend.ts'
import type { ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import { createAgentChatApi } from '../src/parts/AgentChatApi/AgentChatApi.ts'
import { createMemoryTaskStore } from '../src/parts/TaskStore/TaskStore.ts'

const emptyFileSystem: AgentFileSystem = {
  exists: async () => false,
  readDirWithFileTypes: async () => [],
  readFile: async () => '',
  remove: async () => {},
  writeFile: async () => {},
}

test('concurrent conversations keep separate tool sessions and original workspace bindings', async () => {
  let workspace = 'memfs:///first/'
  const firstStarted = Promise.withResolvers<void>()
  const releaseFirst = Promise.withResolvers<void>()
  const hosts: ChatTask[] = []
  const backend: AgentBackend = {
    listModels: async () => [],
    async runStep(
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      options: Parameters<AgentBackend['runStep']>[0],
    ): ReturnType<AgentBackend['runStep']> {
      const input = options.input[0]
      if ('content' in input && input.content.includes('User task:\nfirst')) {
        firstStarted.resolve()
        await releaseFirst.promise
      }
      return { responseId: 'resp-result', text: 'Done', toolCalls: [] }
    },
  }
  const api = createAgentChatApi({
    backend,
    createToolHost: async (task) => {
      hosts.push(task)
      return createAgentToolHost({
        fileSystem: emptyFileSystem,
        workspaceUriProvider: async (): Promise<string> =>
          task.workspaceUri || '',
      })
    },
    store: createMemoryTaskStore(),
    workspaceUriProvider: async (): Promise<string> => workspace,
  })
  const firstRun = api.createTask('first', 'test-model')
  await firstStarted.promise
  workspace = 'memfs:///second/'
  const second = await api.createTask('second', 'test-model')
  expect(second.status).toBe('completed')
  releaseFirst.resolve()
  const first = await firstRun
  expect(first.status).toBe('completed')
  expect(first.workspaceUri).toBe('memfs:///first/')
  expect(second.workspaceUri).toBe('memfs:///second/')
  await api.sendMessage(first, 'follow-up')
  expect(hosts.map((task) => task.workspaceUri)).toEqual([
    'memfs:///first/',
    'memfs:///second/',
    'memfs:///first/',
  ])
  expect(hosts[0].id).not.toBe(hosts[1].id)
})

test('restoring an orphaned running task preserves history without resubmitting it', async () => {
  const store = createMemoryTaskStore()
  const backend: AgentBackend = {
    listModels: async () => [],
    runStep: jest.fn<AgentBackend['runStep']>(),
  }
  const api = createAgentChatApi({
    backend,
    store,
    toolHost: createAgentToolHost(),
  })
  const task: ChatTask = {
    createdAt: '2026-11-03T12:00:00Z',
    events: [],
    id: 'orphan',
    modelId: 'test-model',
    status: 'running',
    streamingText: 'Partial answer',
    title: 'Interrupted task',
    updatedAt: '2026-11-03T12:00:00Z',
    workspaceUri: 'memfs:///original/',
  }
  await store.save(task)
  const restored = await api.getTask(task.id)
  expect(restored?.status).toBe('interrupted')
  expect(restored?.workspaceUri).toBe(task.workspaceUri)
  expect(restored?.events).toContainEqual(
    expect.objectContaining({
      text: 'Partial answer',
      type: 'assistant-message',
    }),
  )
  expect(backend.runStep).not.toHaveBeenCalled()
  const secondRestore = await api.getTask(task.id)
  expect(secondRestore?.events).toHaveLength(restored?.events.length || 0)
})

test('stopping after an edit keeps the file and records stopped status and changed files', async () => {
  let content = ''
  const started = Promise.withResolvers<void>()
  const controller = new AbortController()
  const backend: AgentBackend = {
    listModels: async () => [],
    async runStep(
      // eslint-disable-next-line @typescript-eslint/prefer-readonly-parameter-types
      options: Parameters<AgentBackend['runStep']>[0],
    ): ReturnType<AgentBackend['runStep']> {
      if (!options.previousResponseId) {
        return {
          responseId: 'resp-edit',
          text: '',
          toolCalls: [
            {
              arguments: JSON.stringify({
                newText: 'Applied change',
                oldText: '',
                uri: 'memfs:///project/new.txt',
              }),
              callId: 'edit',
              name: 'apply_patch',
            },
          ],
        }
      }
      started.resolve()
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener(
          'abort',
          () => reject(options.signal?.reason),
          { once: true },
        )
      })
    },
  }
  const api = createAgentChatApi({
    backend,
    store: createMemoryTaskStore(),
    toolHost: createAgentToolHost({
      fileSystem: {
        ...emptyFileSystem,
        readFile: async () => content,
        writeFile: async (_uri, text) => {
          content = text
        },
      },
      workspaceUriProvider: async (): Promise<string> => 'memfs:///project/',
    }),
  })
  const run = api.createTask('Make a change', 'test-model', {
    signal: controller.signal,
  })
  await started.promise
  controller.abort()
  const task = await run
  expect(task.status).toBe('stopped')
  expect(content).toBe('Applied change')
  expect(task.events).toContainEqual(
    expect.objectContaining({
      files: [expect.objectContaining({ path: 'new.txt' })],
      type: 'changes',
    }),
  )
})

test('an explicit continuation after interruption starts a fresh response chain with preserved conversation', async () => {
  const runStep = jest.fn<AgentBackend['runStep']>().mockResolvedValue({
    responseId: 'resumed',
    text: 'Continued.',
    toolCalls: [],
  })
  const store = createMemoryTaskStore()
  const task: ChatTask = {
    createdAt: '2026-11-03T12:00:00Z',
    events: [
      {
        id: 'prior',
        text: 'Original request',
        timestamp: '2026-11-03T12:00:00Z',
        type: 'user-message',
      },
    ],
    id: 'resume-test',
    modelId: 'test-model',
    responseId: 'dangling-tool-call',
    status: 'interrupted',
    title: 'Continue',
    updatedAt: '2026-11-03T12:00:00Z',
    workspaceUri: 'memfs:///original/',
  }
  await store.save(task)
  const api = createAgentChatApi({
    backend: { listModels: async () => [], runStep },
    store,
    toolHost: createAgentToolHost(),
  })
  const resumed = await api.sendMessage(
    task,
    'Continue with the existing edits',
  )
  expect(resumed.status).toBe('completed')
  expect(resumed.workspaceUri).toBe(task.workspaceUri)
  const request = runStep.mock.calls[0]?.[0]
  expect(request?.previousResponseId).toBeUndefined()
  expect(request?.input).toEqual([
    expect.objectContaining({
      content: expect.stringContaining('Original request'),
    }),
  ])
  expect(
    resumed.events.filter((event) => event.type === 'user-message'),
  ).toHaveLength(2)
})

test('recovery cannot overwrite a turn that completed after the initial read', async () => {
  const task: ChatTask = {
    createdAt: '2026-11-04T12:00:00Z',
    events: [],
    id: 'completion-race',
    modelId: 'test-model',
    status: 'running',
    streamingText: 'Partial answer',
    title: 'Completing task',
    updatedAt: '2026-11-04T12:00:00Z',
  }
  const { streamingText: _partial, ...completedBase } = task
  const completed: ChatTask = {
    ...completedBase,
    events: [
      {
        id: 'answer',
        text: 'Final answer',
        timestamp: task.updatedAt,
        type: 'assistant-message',
      },
    ],
    status: 'completed',
  }
  const memory = createMemoryTaskStore([task])
  let firstRead = true
  const store = {
    ...memory,
    async get(id: string): Promise<ChatTask | undefined> {
      const snapshot = await memory.get(id)
      if (firstRead) {
        firstRead = false
        await memory.save(completed)
      }
      return snapshot
    },
  }
  const backend: AgentBackend = {
    listModels: async () => [],
    runStep: jest.fn<AgentBackend['runStep']>(),
  }
  const api = createAgentChatApi({
    backend,
    store,
    toolHost: createAgentToolHost(),
  })
  await expect(api.getTask(task.id)).resolves.toMatchObject({
    events: completed.events,
    status: 'completed',
  })
  await expect(memory.get(task.id)).resolves.toMatchObject({
    events: completed.events,
    status: 'completed',
  })
  expect(backend.runStep).not.toHaveBeenCalled()
})
