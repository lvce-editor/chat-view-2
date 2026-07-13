import { expect, test } from '@jest/globals'
import type { ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import { createMemoryTaskStore } from '../src/parts/TaskStore/TaskStore.ts'

const createTask = (id: string, updatedAt: string): ChatTask => ({
  createdAt: updatedAt,
  events: [],
  id,
  modelId: 'gpt-test',
  status: 'completed',
  title: id,
  updatedAt,
})

test('lists persisted tasks newest first and applies a limit', async () => {
  const store = createMemoryTaskStore([
    createTask('older', '2026-01-01T00:00:00.000Z'),
    createTask('newer', '2026-02-01T00:00:00.000Z'),
  ])

  await expect(store.list(1)).resolves.toEqual([
    expect.objectContaining({ id: 'newer' }),
  ])
})
