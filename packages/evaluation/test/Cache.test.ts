import { notStrictEqual, strictEqual } from 'node:assert'
import { test } from 'node:test'
import { createCacheKey } from '../src/Cache.ts'

void test('creates a stable key for equivalent JSON objects', () => {
  const first = createCacheKey({ body: { input: ['hello'], stream: true } })
  const second = createCacheKey({ body: { input: ['hello'], stream: true } })
  strictEqual(first, second)
})

void test('includes array order and values in the key', () => {
  const first = createCacheKey({ input: ['hello', 'world'] })
  const second = createCacheKey({ input: ['world', 'hello'] })
  notStrictEqual(first, second)
  strictEqual(first.length, 64)
})
