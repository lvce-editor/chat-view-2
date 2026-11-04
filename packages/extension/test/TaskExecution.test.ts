import { expect, jest, test } from '@jest/globals'
import {
  tryWithTaskExecution,
  withTaskExecution,
} from '../src/parts/TaskExecution/TaskExecution.ts'

test('a second operation cannot enter an active conversation and can enter after it finishes', async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const first = withTaskExecution('exclusive-conversation', async () => {
    entered.resolve()
    await release.promise
    return 'first'
  })
  await entered.promise
  const second = jest.fn(async () => 'second')
  try {
    await expect(
      tryWithTaskExecution('exclusive-conversation', second),
    ).resolves.toEqual({ acquired: false })
    expect(second).not.toHaveBeenCalled()
  } finally {
    release.resolve()
  }
  await expect(first).resolves.toBe('first')
  await expect(
    tryWithTaskExecution('exclusive-conversation', second),
  ).resolves.toEqual({ acquired: true, value: 'second' })
})

test('an operation failure releases the conversation for a retry', async () => {
  await expect(
    withTaskExecution('retry-conversation', async () => {
      throw new Error('operation failed')
    }),
  ).rejects.toThrow('operation failed')
  await expect(
    withTaskExecution('retry-conversation', async () => 'retry'),
  ).resolves.toBe('retry')
})

test('a lock held by another window prevents recovery and execution callbacks', async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'locks')
  const operation = jest.fn(async () => 'unexpected')
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (
        _name: string,
        _options: Readonly<LockOptions>,
        callback: (lock: null) => Promise<unknown>,
      ): Promise<unknown> => callback(null),
    },
  })
  try {
    await expect(
      tryWithTaskExecution('other-window', operation),
    ).resolves.toEqual({ acquired: false })
    await expect(withTaskExecution('other-window', operation)).rejects.toThrow(
      'another window',
    )
    expect(operation).not.toHaveBeenCalled()
  } finally {
    if (original) Object.defineProperty(navigator, 'locks', original)
    else Reflect.deleteProperty(navigator, 'locks')
  }
})
