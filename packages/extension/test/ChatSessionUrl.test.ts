// cspell:ignore Fwith
import { expect, test } from '@jest/globals'
import {
  getChatPath,
  getChatTaskHash,
  getIdePath,
  isChatPath,
  parseChatTaskHash,
} from '../src/parts/ChatSessionUrl/ChatSessionUrl.ts'

test('creates a plain encoded chat task fragment', () => {
  const hash = getChatTaskHash('task/with spaces')

  expect(hash).toBe('#task%2Fwith%20spaces')
  expect(
    parseChatTaskHash(`https://example.com/app/chat?workspace=project${hash}`),
  ).toEqual({
    id: 'task/with spaces',
    type: 'task',
  })
})

test.each(['7d107d77-56d6-458f-b17f-27dce196bb8b', 'task-1791373265724-1'])(
  'round-trips chat task ID %s',
  (id) => {
    expect(
      parseChatTaskHash(
        `https://example.com/prefix/chat/${getChatTaskHash(id)}`,
      ),
    ).toEqual({
      id,
      type: 'task',
    })
  },
)

test('reads new-format IDs only on the chat route and keeps legacy links working', () => {
  expect(parseChatTaskHash('https://example.com/#section')).toEqual({
    type: 'none',
  })
  expect(parseChatTaskHash('https://example.com/#legacy-id')).toEqual({
    type: 'none',
  })
  expect(parseChatTaskHash('https://example.com/#chat-old-id')).toEqual({
    id: 'old-id',
    type: 'task',
  })
  expect(parseChatTaskHash('https://example.com/prefix/chat#new-id')).toEqual({
    id: 'new-id',
    type: 'task',
  })
  expect(parseChatTaskHash('https://example.com/prefix/chat')).toEqual({
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
  expect(parseChatTaskHash('https://example.com/prefix/chat#%E0%A4%A')).toEqual(
    {
      type: 'invalid',
    },
  )
})

test('detects chat routes and preserves the deployment prefix', () => {
  expect(isChatPath('/prefix/chat')).toBe(true)
  expect(isChatPath('/prefix/chat/')).toBe(true)
  expect(isChatPath('/prefix/')).toBe(false)
  expect(
    getChatPath('https://example.com/prefix/?workspace=one', '/prefix/commit'),
  ).toBe('/prefix/chat')
  expect(getChatPath('https://example.com/?workspace=one', '/commit')).toBe(
    '/chat',
  )
  expect(getIdePath('https://example.com/prefix/chat?workspace=one#id')).toBe(
    '/prefix/',
  )
  expect(getIdePath('https://example.com/chat/')).toBe('/')
})
