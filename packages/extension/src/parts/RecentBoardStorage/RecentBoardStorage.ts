import {
  createLocalCacheRequestUrl,
  deleteLocalCacheRequest,
  matchLocalCacheRequest,
} from '../LocalCacheRequest/LocalCacheRequest.ts'

export interface RecentBoardView {
  readonly boardId: string
  readonly viewedAt: string
}

export interface RecentBoardStorage {
  readonly delete: () => Promise<void>
  readonly read: () => Promise<readonly RecentBoardView[]>
  readonly write: (
    recentBoardViews: readonly RecentBoardView[],
  ) => Promise<void>
}

export const cacheName = 'builtin.trello.recent-boards'
export const testCacheName = 'test.builtin.trello.recent-boards'
const legacyRecentBoardsRequestUrl = '/recent-boards.json'
export const recentBoardsRequestUrl = createLocalCacheRequestUrl(
  legacyRecentBoardsRequestUrl,
)
export const maxRecentBoards = 20

const isRecentBoardView = (value: unknown): value is RecentBoardView => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.boardId === 'string' && typeof record.viewedAt === 'string'
  )
}

const isRecentBoardViews = (
  value: unknown,
): value is readonly RecentBoardView[] => {
  return Array.isArray(value) && value.every(isRecentBoardView)
}

export const updateRecentBoardViews = (
  recentBoardViews: readonly RecentBoardView[],
  boardId: string,
  viewedAt: string,
): readonly RecentBoardView[] => {
  return [
    {
      boardId,
      viewedAt,
    },
    ...recentBoardViews.filter((item) => item.boardId !== boardId),
  ].slice(0, maxRecentBoards)
}

export const createCacheRecentBoardStorage = (
  selectedCacheName = cacheName,
): RecentBoardStorage => {
  return {
    async delete(): Promise<void> {
      const cache = await caches.open(selectedCacheName)
      await deleteLocalCacheRequest(
        cache,
        recentBoardsRequestUrl,
        legacyRecentBoardsRequestUrl,
      )
    },
    async read(): Promise<readonly RecentBoardView[]> {
      const cache = await caches.open(selectedCacheName)
      const response = await matchLocalCacheRequest(
        cache,
        recentBoardsRequestUrl,
        legacyRecentBoardsRequestUrl,
      )
      if (!response) {
        return []
      }
      const value = await response.json()
      if (!isRecentBoardViews(value)) {
        return []
      }
      return value.slice(0, maxRecentBoards)
    },
    async write(recentBoardViews: readonly RecentBoardView[]): Promise<void> {
      const cache = await caches.open(selectedCacheName)
      await cache.put(
        recentBoardsRequestUrl,
        Response.json(recentBoardViews.slice(0, maxRecentBoards)),
      )
    },
  }
}

export const createMemoryRecentBoardStorage = (
  initial: readonly RecentBoardView[] = [],
): RecentBoardStorage => {
  let value = initial
  return {
    async delete(): Promise<void> {
      value = []
    },
    async read(): Promise<readonly RecentBoardView[]> {
      return value
    },
    async write(recentBoardViews: readonly RecentBoardView[]): Promise<void> {
      value = recentBoardViews.slice(0, maxRecentBoards)
    },
  }
}
