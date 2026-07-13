import { expect, test } from '@jest/globals'
import { summarizeTask } from '../src/parts/ChatTask/ChatTask.ts'
import { createMockChatApi } from '../src/parts/MockChatApi/MockChatApi.ts'

test('returns only OpenAI models', async () => {
  const api = createMockChatApi()
  const models = await api.listModels()

  expect(models).toHaveLength(2)
  expect(models.every((model) => model.id.startsWith('gpt-'))).toBe(true)
})

test('limits the number of returned tasks', async () => {
  const api = createMockChatApi()

  await expect(api.listTasks(3)).resolves.toHaveLength(3)
  await expect(api.listTasks(100)).resolves.toHaveLength(20)
})

test('keeps an append-only event history for a completed task', async () => {
  const api = createMockChatApi()
  const task = await api.createTask('A new task', 'gpt-5.4')

  expect(task.title).toBe('A new task')
  expect(task.status).toBe('completed')
  expect(task.events.map((event) => event.type)).toEqual([
    'user-message',
    'status',
    'activity',
    'activity',
    'assistant-message',
    'changes',
    'status',
  ])
  const tasks = await api.listTasks(20)
  expect(tasks).toHaveLength(20)
  expect(tasks[0]).toEqual(task)
})

test('provides a five-file change fixture with line totals', async () => {
  const api = createMockChatApi()
  const task = await api.createTask('Change several files', 'gpt-5.4')
  const { changedFiles } = summarizeTask(task)

  expect(changedFiles).toHaveLength(5)
  expect(changedFiles.reduce((total, file) => total + file.additions, 0)).toBe(
    51,
  )
  expect(changedFiles.reduce((total, file) => total + file.deletions, 0)).toBe(
    10,
  )
})
