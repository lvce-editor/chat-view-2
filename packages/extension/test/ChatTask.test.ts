/* eslint-disable unicorn/no-array-reduce */
import { expect, test } from '@jest/globals'
import type { ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import {
  appendEvent,
  createEvent,
  summarizeTask,
} from '../src/parts/ChatTask/ChatTask.ts'

const baseTask: ChatTask = {
  createdAt: '2026-01-01T00:00:00.000Z',
  events: [],
  id: 'task-1',
  modelId: 'gpt-test',
  status: 'idle',
  title: 'Task',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

test('reduces messages, activity, errors, and latest changes from events', () => {
  const task = [
    createEvent({ text: 'Do work', type: 'user-message' }),
    createEvent({ label: 'Read', status: 'completed', type: 'activity' }),
    createEvent({ text: 'Done', type: 'assistant-message' }),
    createEvent({
      checksPassed: 1,
      files: [
        {
          additions: 1,
          deletions: 1,
          path: 'a.ts',
          status: 'modified',
        },
      ],
      type: 'changes',
    }),
  ].reduce(appendEvent, baseTask)

  expect(summarizeTask(task)).toEqual(
    expect.objectContaining({
      changedFiles: [
        {
          additions: 1,
          deletions: 1,
          path: 'a.ts',
          status: 'modified',
        },
      ],
      checksPassed: 1,
      errorMessage: '',
    }),
  )
})

test.each(['running', 'completed', 'idle'] as const)(
  'clears previous errors for a new %s run',
  (status) => {
    let task = appendEvent(
      baseTask,
      createEvent({ message: 'Previous failure', type: 'error' }),
    )
    expect(summarizeTask(task).errorMessage).toBe('Previous failure')
    task = appendEvent(task, createEvent({ status: 'running', type: 'status' }))
    task = appendEvent(task, createEvent({ status, type: 'status' }))
    expect(summarizeTask(task).errorMessage).toBe('')
  },
)

test('shows a new failure after clearing an earlier run error', () => {
  const task = [
    createEvent({ message: 'Previous failure', type: 'error' }),
    createEvent({ status: 'failed', type: 'status' }),
    createEvent({ status: 'running', type: 'status' }),
    createEvent({ message: 'New failure', type: 'error' }),
    createEvent({ status: 'failed', type: 'status' }),
  ].reduce(appendEvent, baseTask)
  expect(summarizeTask(task).errorMessage).toBe('New failure')
})
