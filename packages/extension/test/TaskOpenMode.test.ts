import { expect, test } from '@jest/globals'
import {
  normalizeTaskOpenMode,
  readTaskOpenMode,
} from '../src/parts/ChatView/TaskOpenMode.ts'

test('defaults to opening tasks on mousedown', () => {
  expect(normalizeTaskOpenMode(undefined)).toBe('mousedown')
  expect(normalizeTaskOpenMode('invalid')).toBe('mousedown')
})

test('allows opening tasks on click', () => {
  expect(normalizeTaskOpenMode('click')).toBe('click')
})

test('reads the configured task open mode', async () => {
  await expect(readTaskOpenMode(async () => 'click')).resolves.toBe('click')
  await expect(
    readTaskOpenMode(async () => {
      throw new Error('preference unavailable')
    }),
  ).resolves.toBe('mousedown')
})
