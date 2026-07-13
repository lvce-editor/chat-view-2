import { expect, test } from '@jest/globals'
import {
  cacheName,
  createCacheCredentialStorage,
  createMemoryCredentialStorage,
  credentialsRequestUrl,
} from '../src/parts/CredentialStorage/CredentialStorage.ts'
import {
  createCacheCurrentBoardStorage,
  currentBoardRequestUrl,
} from '../src/parts/CurrentBoardStorage/CurrentBoardStorage.ts'
import {
  createCacheRecentBoardStorage,
  recentBoardsRequestUrl,
} from '../src/parts/RecentBoardStorage/RecentBoardStorage.ts'

const validApiKey = 'abcdefghijklmnopqrstuvwxyz123456'
const validToken =
  'abcdefghijklmnopqrstuvwxyz123456abcdefghijklmnopqrstuvwxyz123456'
const recentBoardViews = [
  {
    boardId: 'board-1',
    viewedAt: '2026-07-05T12:00:00.000Z',
  },
]

const withMockCaches = async (
  cache: Readonly<Cache>,
  run: () => Promise<void>,
): Promise<void> => {
  const originalCaches = globalThis.caches
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      async open(): Promise<Cache> {
        return cache
      },
    },
  })

  try {
    await run()
  } finally {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: originalCaches,
    })
  }
}

test('memory credential storage reads and writes credentials', async () => {
  const storage = createMemoryCredentialStorage()
  await expect(storage.read()).resolves.toBeUndefined()

  await storage.write({
    apiKey: validApiKey,
    token: validToken,
  })

  await expect(storage.read()).resolves.toEqual({
    apiKey: validApiKey,
    token: validToken,
  })
})

test('memory credential storage deletes credentials', async () => {
  const storage = createMemoryCredentialStorage({
    apiKey: validApiKey,
    token: validToken,
  })

  await storage.delete()

  await expect(storage.read()).resolves.toBeUndefined()
})

test('cache credential storage uses the production cache name by default', async () => {
  const openedCacheNames: string[] = []
  const originalCaches = globalThis.caches
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      async open(selectedCacheName: string): Promise<Cache> {
        openedCacheNames.push(selectedCacheName)
        return {
          async match(): Promise<undefined> {
            return undefined
          },
        } as unknown as Cache
      },
    },
  })

  try {
    await createCacheCredentialStorage().read()
  } finally {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: originalCaches,
    })
  }

  expect(openedCacheNames).toEqual([cacheName])
})

test('cache credential storage can use an isolated cache name', async () => {
  const openedCacheNames: string[] = []
  const originalCaches = globalThis.caches
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      async open(selectedCacheName: string): Promise<Cache> {
        openedCacheNames.push(selectedCacheName)
        return {
          async match(): Promise<undefined> {
            return undefined
          },
        } as unknown as Cache
      },
    },
  })

  try {
    await createCacheCredentialStorage('test-cache-name').read()
  } finally {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: originalCaches,
    })
  }

  expect(openedCacheNames).toEqual(['test-cache-name'])
})

test('cache storages use electron-safe https request urls', async () => {
  const matched: string[] = []
  const put: string[] = []
  const deleted: string[] = []
  const cache = {
    async delete(request: string): Promise<boolean> {
      deleted.push(request)
      return true
    },
    async match(request: string): Promise<undefined> {
      matched.push(request)
      return undefined
    },
    async put(request: string): Promise<void> {
      put.push(request)
    },
  } as unknown as Cache

  await withMockCaches(cache, async () => {
    await createCacheCredentialStorage().read()
    await createCacheCredentialStorage().write({
      apiKey: validApiKey,
      token: validToken,
    })
    await createCacheCredentialStorage().delete()
    await createCacheCurrentBoardStorage().read()
    await createCacheCurrentBoardStorage().write('board-1')
    await createCacheCurrentBoardStorage().delete()
    await createCacheRecentBoardStorage().read()
    await createCacheRecentBoardStorage().write(recentBoardViews)
    await createCacheRecentBoardStorage().delete()
  })

  expect(credentialsRequestUrl).toBe('https://trello.com/credentials.json')
  expect(currentBoardRequestUrl).toBe('https://trello.com/current-board.json')
  expect(recentBoardsRequestUrl).toBe('https://trello.com/recent-boards.json')
  expect(matched).toEqual([
    credentialsRequestUrl,
    '/credentials.json',
    currentBoardRequestUrl,
    '/current-board.json',
    recentBoardsRequestUrl,
    '/recent-boards.json',
  ])
  expect(put).toEqual([
    credentialsRequestUrl,
    currentBoardRequestUrl,
    recentBoardsRequestUrl,
  ])
  expect(deleted).toEqual([
    credentialsRequestUrl,
    '/credentials.json',
    currentBoardRequestUrl,
    '/current-board.json',
    recentBoardsRequestUrl,
    '/recent-boards.json',
  ])
})

test('cache storages read legacy relative cache keys when available', async () => {
  const cache = {
    async match(request: string): Promise<Response | undefined> {
      if (request === '/credentials.json') {
        return Response.json({
          apiKey: validApiKey,
          token: validToken,
        })
      }
      if (request === '/current-board.json') {
        return Response.json('board-1')
      }
      if (request === '/recent-boards.json') {
        return Response.json(recentBoardViews)
      }
      return undefined
    },
  } as unknown as Cache

  await withMockCaches(cache, async () => {
    await expect(createCacheCredentialStorage().read()).resolves.toEqual({
      apiKey: validApiKey,
      token: validToken,
    })
    await expect(createCacheCurrentBoardStorage().read()).resolves.toBe(
      'board-1',
    )
    await expect(createCacheRecentBoardStorage().read()).resolves.toEqual(
      recentBoardViews,
    )
  })
})

test('cache storages ignore unsupported legacy relative cache keys', async () => {
  const matched: string[] = []
  const put: string[] = []
  const deleted: string[] = []
  const cache = {
    async delete(request: string): Promise<boolean> {
      deleted.push(request)
      if (request.startsWith('/')) {
        throw new TypeError("Request scheme 'lvce' is unsupported")
      }
      return true
    },
    async match(request: string): Promise<undefined> {
      matched.push(request)
      if (request.startsWith('/')) {
        throw new TypeError("Request scheme 'lvce' is unsupported")
      }
      return undefined
    },
    async put(request: string): Promise<void> {
      put.push(request)
    },
  } as unknown as Cache

  await withMockCaches(cache, async () => {
    await expect(createCacheCredentialStorage().read()).resolves.toBeUndefined()
    await createCacheCredentialStorage().write({
      apiKey: validApiKey,
      token: validToken,
    })
    await createCacheCredentialStorage().delete()
    await expect(
      createCacheCurrentBoardStorage().read(),
    ).resolves.toBeUndefined()
    await createCacheCurrentBoardStorage().write('board-1')
    await createCacheCurrentBoardStorage().delete()
    await expect(createCacheRecentBoardStorage().read()).resolves.toEqual([])
    await createCacheRecentBoardStorage().write(recentBoardViews)
    await createCacheRecentBoardStorage().delete()
  })

  expect(matched).toEqual([
    credentialsRequestUrl,
    '/credentials.json',
    currentBoardRequestUrl,
    '/current-board.json',
    recentBoardsRequestUrl,
    '/recent-boards.json',
  ])
  expect(put).toEqual([
    credentialsRequestUrl,
    currentBoardRequestUrl,
    recentBoardsRequestUrl,
  ])
  expect(deleted).toEqual([
    credentialsRequestUrl,
    '/credentials.json',
    currentBoardRequestUrl,
    '/current-board.json',
    recentBoardsRequestUrl,
    '/recent-boards.json',
  ])
})
