import { expect, test } from '@jest/globals'
import { createMockChatApi } from '../src/parts/MockChatApi/MockChatApi.ts'

test('limits the number of returned mock tasks', async () => {
  const api = createMockChatApi()

  await expect(api.listTasks(3)).resolves.toHaveLength(3)
  await expect(api.listTasks(100)).resolves.toHaveLength(20)
})

test('keeps only 20 tasks after creating a task', async () => {
  const api = createMockChatApi()
  const task = await api.createTask('A new task')

  expect(task.title).toBe('A new task')
  const tasks = await api.listTasks(20)
  expect(tasks).toHaveLength(20)
  expect(tasks[0]).toEqual(task)
})
