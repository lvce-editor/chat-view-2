import { expect, jest, test } from '@jest/globals'
import type { ChatApi, ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import { createHeadlessChatCommands } from '../src/parts/HeadlessChat/HeadlessChat.ts'

const sessionIdRegex = /^session-/

const completedTask = (id: string): ChatTask => ({
  createdAt: '2026-07-14T00:00:00.000Z',
  events: [],
  id,
  modelId: 'test-model',
  status: 'completed',
  title: 'Test task',
  updatedAt: '2026-07-14T00:00:00.000Z',
})

test('creates a session and sends messages through the real chat API surface', async () => {
  const firstTask = completedTask('task-1')
  const secondTask = completedTask('task-2')
  const api = {
    createTask: jest.fn(async () => firstTask),
    listModels: jest.fn(async () => [
      {
        available: true,
        id: 'test-model',
        label: 'Test model',
        planEligible: true,
      },
    ]),
    sendMessage: jest.fn(async () => secondTask),
  } as unknown as ChatApi
  const commands = createHeadlessChatCommands(async () => api)

  const sessionId = await commands.createSession('test-model')
  const created = await commands.sendMessage('First message')
  const continued = await commands.sendMessage('Second message')

  expect(sessionId.startsWith('session-')).toBe(true)
  expect(created).toBe(firstTask)
  expect(continued).toBe(secondTask)
  expect(api.createTask).toHaveBeenCalledWith(
    'First message',
    'test-model',
    expect.objectContaining({ onTrace: expect.any(Function) }),
  )
  expect(api.sendMessage).toHaveBeenCalledWith(
    firstTask,
    'Second message',
    expect.objectContaining({ onTrace: expect.any(Function) }),
  )
})

test('rejects unavailable models and unknown sessions', async () => {
  const api = {
    listModels: jest.fn(async () => []),
  } as unknown as ChatApi
  const commands = createHeadlessChatCommands(async () => api)

  await expect(commands.createSession('missing-model')).rejects.toThrow(
    'Chat model is not available: missing-model',
  )
  await expect(
    commands.sendMessage('missing-session', 'Hello'),
  ).rejects.toThrow('Headless chat session was not found: missing-session')
})

test('propagates a failed agent task through the command boundary', async () => {
  const task: ChatTask = {
    ...completedTask('failed-task'),
    events: [
      {
        id: 'error-1',
        message: 'Model request failed',
        timestamp: '2026-07-14T00:00:00.000Z',
        type: 'error',
      },
    ],
    status: 'failed',
  }
  const api = {
    createTask: jest.fn(async () => task),
    listModels: jest.fn(async () => [
      {
        available: true,
        id: 'test-model',
        label: 'Test model',
        planEligible: true,
      },
    ]),
  } as unknown as ChatApi
  const commands = createHeadlessChatCommands(async () => api)

  await commands.createSession('test-model')
  await expect(commands.sendMessage('Hello')).rejects.toThrow(
    'Model request failed',
  )
})

test('returns a complete prompt result with collected trace messages', async () => {
  const task = completedTask('task-1')
  const api = {
    async createTask(
      _message: string,
      _modelId: string,
      options?: { readonly onTrace?: (message: unknown) => void },
    ) {
      options?.onTrace?.({
        content: 'Fix the tests',
        role: 'user',
        timestamp: 1,
      })
      return task
    },
    async listModels() {
      return [
        {
          available: true,
          id: 'test-model',
          label: 'Test model',
          planEligible: true,
        },
      ]
    },
  } as unknown as ChatApi
  const commands = createHeadlessChatCommands(async () => api)

  const result = await commands.runPrompt('Fix the tests', 'test-model')

  expect(result).toEqual({
    sessionId: expect.stringMatching(sessionIdRegex),
    status: 'completed',
    task,
    trace: [
      {
        content: 'Fix the tests',
        role: 'user',
        timestamp: 1,
      },
    ],
  })
})

test('returns failed prompt details instead of losing the task', async () => {
  const task: ChatTask = {
    ...completedTask('failed-task'),
    events: [
      {
        id: 'error-1',
        message: 'Model request failed',
        timestamp: '2026-07-14T00:00:00.000Z',
        type: 'error',
      },
    ],
    status: 'failed',
  }
  const api = {
    async createTask() {
      return task
    },
    async listModels() {
      return [
        {
          available: true,
          id: 'test-model',
          label: 'Test model',
          planEligible: true,
        },
      ]
    },
  } as unknown as ChatApi
  const commands = createHeadlessChatCommands(async () => api)

  const result = await commands.runPrompt('Fix the tests')

  expect(result).toEqual({
    error: 'Model request failed',
    sessionId: expect.stringMatching(sessionIdRegex),
    status: 'failed',
    task,
    trace: [],
  })
})
