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

test('archives a task without deleting its persisted data', async () => {
  const task = createTask('task-1', '2026-01-01T00:00:00.000Z')
  const store = createMemoryTaskStore([task])

  await store.archive(task.id)

  await expect(store.list(20)).resolves.toEqual([])
  await expect(store.get(task.id)).resolves.toEqual(
    expect.objectContaining({ archived: true, id: task.id }),
  )
})

test('renames a persisted task and protects the title from background updates', async () => {
  const task = {
    ...createTask('task-1', '2026-01-01T00:00:00.000Z'),
    titleGenerated: true,
  }
  const store = createMemoryTaskStore([task])

  await expect(store.rename(task.id, 'A custom name')).resolves.toEqual(
    expect.objectContaining({
      id: task.id,
      title: 'A custom name',
      titleGenerated: true,
    }),
  )
  await store.save({ ...task, title: 'Late generated title' })

  await expect(store.get(task.id)).resolves.toEqual(
    expect.objectContaining({ title: 'A custom name', titleGenerated: true }),
  )
})

test('does not rename an archived task', async () => {
  const task = createTask('task-1', '2026-01-01T00:00:00.000Z')
  const store = createMemoryTaskStore([task])
  await store.archive(task.id)

  await expect(store.rename(task.id, 'A custom name')).resolves.toBeUndefined()
})

test('keeps a task archived when a background update is saved', async () => {
  const task = createTask('task-1', '2026-01-01T00:00:00.000Z')
  const store = createMemoryTaskStore([task])
  await store.archive(task.id)

  await store.save({ ...task, title: 'Updated in the background' })

  await expect(store.list(20)).resolves.toEqual([])
  await expect(store.get(task.id)).resolves.toEqual(
    expect.objectContaining({
      archived: true,
      title: 'Updated in the background',
    }),
  )
})
