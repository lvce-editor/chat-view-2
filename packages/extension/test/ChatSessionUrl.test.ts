import { expect, test } from '@jest/globals'
import {
  getChatTaskHash,
  parseChatTaskHash,
} from '../src/parts/ChatSessionUrl/ChatSessionUrl.ts'

test('creates a chat task fragment that can be parsed back', () => {
  const hash = getChatTaskHash('task/with spaces')

  expect(hash).toBe('#chat-task%2Fwith%20spaces')
  expect(
    parseChatTaskHash(`https://example.com/app?workspace=project${hash}`),
  ).toEqual({
    id: 'task/with spaces',
    type: 'task',
  })
})

test('ignores unrelated fragments', () => {
  expect(parseChatTaskHash('https://example.com/#section')).toEqual({
    type: 'none',
  })
})

test('marks empty and malformed chat fragments invalid', () => {
  expect(parseChatTaskHash('https://example.com/#chat-')).toEqual({
    type: 'invalid',
  })
  expect(parseChatTaskHash('https://example.com/#chat-%E0%A4%A')).toEqual({
    type: 'invalid',
  })
})
