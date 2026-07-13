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
      files: [{ path: 'a.ts', status: 'modified' }],
      type: 'changes',
    }),
  ].reduce(appendEvent, baseTask)

  expect(summarizeTask(task)).toEqual(
    expect.objectContaining({
      changedFiles: [{ path: 'a.ts', status: 'modified' }],
      checksPassed: 1,
      errorMessage: '',
    }),
  )
})
