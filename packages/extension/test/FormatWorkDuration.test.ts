import { expect, test } from '@jest/globals'
import type { ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import {
  formatWorkDuration,
  getWorkDurationSeconds,
} from '../src/parts/ChatView/FormatWorkDuration.ts'

const baseTask: ChatTask = {
  createdAt: '2026-07-15T12:00:00.000Z',
  events: [],
  id: 'task',
  modelId: 'gpt-5.4',
  status: 'completed',
  title: 'Task',
  updatedAt: '2026-07-15T12:00:02.000Z',
}

test('formats work durations using seconds through years', () => {
  const cases = [
    [0, '0 seconds'],
    [1, '1 second'],
    [59, '59 seconds'],
    [60, '1 minute'],
    [60 * 60, '1 hour'],
    [60 * 60 * 24, '1 day'],
    [60 * 60 * 24 * 7, '1 week'],
    [60 * 60 * 24 * 30, '1 month'],
    [60 * 60 * 24 * 365, '1 year'],
  ] as const

  for (const [seconds, expected] of cases) {
    expect(formatWorkDuration(seconds)).toBe(expected)
  }
  expect(formatWorkDuration(NaN)).toBe('0 seconds')
  expect(formatWorkDuration(-1)).toBe('0 seconds')
})

test('stops completed work at the terminal event even after task updates', () => {
  const task: ChatTask = {
    ...baseTask,
    events: [
      {
        id: 'running',
        status: 'running',
        timestamp: '2026-07-15T12:00:00.000Z',
        type: 'status',
      },
      {
        id: 'answer',
        text: 'Done',
        timestamp: '2026-07-15T12:00:02.000Z',
        type: 'assistant-message',
      },
      {
        id: 'completed',
        status: 'completed',
        timestamp: '2026-07-15T12:00:02.000Z',
        type: 'status',
      },
    ],
    updatedAt: '2026-07-17T12:00:00.000Z',
  }

  expect(
    getWorkDurationSeconds(task, Date.parse('2026-07-17T12:00:00.000Z')),
  ).toBe(2)
})

test('measures only the latest resumed turn', () => {
  const task: ChatTask = {
    ...baseTask,
    events: [
      {
        id: 'first-start',
        status: 'running',
        timestamp: '2026-07-15T12:00:00.000Z',
        type: 'status',
      },
      {
        id: 'first-stop',
        status: 'interrupted',
        timestamp: '2026-07-15T12:00:02.000Z',
        type: 'status',
      },
      {
        id: 'followup',
        text: 'Continue',
        timestamp: '2026-07-15T12:01:00.000Z',
        type: 'user-message',
      },
      {
        id: 'second-start',
        status: 'running',
        timestamp: '2026-07-15T12:01:01.000Z',
        type: 'status',
      },
      {
        id: 'second-stop',
        status: 'stopped',
        timestamp: '2026-07-15T12:01:04.000Z',
        type: 'status',
      },
    ],
    status: 'stopped',
  }

  expect(getWorkDurationSeconds(task)).toBe(3)
})

test('returns a safe duration when history timestamps are missing or invalid', () => {
  const task: ChatTask = {
    ...baseTask,
    createdAt: 'invalid',
    events: [
      {
        id: 'running',
        status: 'running',
        timestamp: 'invalid',
        type: 'status',
      },
      {
        id: 'completed',
        status: 'completed',
        timestamp: 'invalid',
        type: 'status',
      },
    ],
    updatedAt: 'invalid',
  }

  expect(getWorkDurationSeconds(task, 10_000)).toBe(0)
  expect(Number.isFinite(getWorkDurationSeconds(task, 10_000))).toBe(true)
})
