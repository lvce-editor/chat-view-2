import { testCacheName as testCredentialCacheName } from '../CredentialStorage/CredentialStorage.ts'
import { testCacheName as testCurrentBoardCacheName } from '../CurrentBoardStorage/CurrentBoardStorage.ts'
import { testCacheName as testRecentBoardCacheName } from '../RecentBoardStorage/RecentBoardStorage.ts'
import { testTrelloApiCacheName } from '../TrelloClient/TrelloApiCache.ts'
import { testTrelloImageCacheName } from '../TrelloImageCache/TrelloImageCache.ts'

export const testCacheNames = [
  testCredentialCacheName,
  testCurrentBoardCacheName,
  testRecentBoardCacheName,
  testTrelloApiCacheName,
  testTrelloImageCacheName,
] as const

export const clearTrelloTestCaches = async (
  cacheStorage: Readonly<CacheStorage> | undefined = globalThis.caches,
): Promise<void> => {
  if (!cacheStorage) {
    return
  }
  await Promise.all(
    testCacheNames.map((cacheName) => {
      return cacheStorage.delete(cacheName)
    }),
  )
}
