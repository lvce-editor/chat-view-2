import { expect, test } from '@jest/globals'
import { formatMessageDate } from '../src/parts/ChatView/FormatMessageDate.ts'

const now = Date.parse('2026-11-06T12:00:00.000Z')

test('formats message timestamps using relative time units', () => {
  expect(formatMessageDate(new Date(now - 4 * 60_000).toISOString(), now)).toBe(
    '4 minutes ago',
  )
  expect(formatMessageDate(new Date(now - 60_000).toISOString(), now)).toBe(
    '1 minute ago',
  )
  expect(
    formatMessageDate(new Date(now - 60 * 60_000).toISOString(), now),
  ).toBe('1 hour ago')
  expect(
    formatMessageDate(new Date(now - 7 * 24 * 60 * 60_000).toISOString(), now),
  ).toBe('1 week ago')
})

test('formats future timestamps and leaves invalid timestamps unchanged', () => {
  expect(formatMessageDate(new Date(now + 2 * 60_000).toISOString(), now)).toBe(
    'in 2 minutes',
  )
  expect(formatMessageDate('invalid timestamp', now)).toBe('invalid timestamp')
})
