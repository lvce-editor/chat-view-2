import { expect, test } from '@jest/globals'
import {
  cacheName as credentialCacheName,
  testCacheName as testCredentialCacheName,
} from '../src/parts/CredentialStorage/CredentialStorage.ts'
import {
  clearTrelloTestCaches,
  testCacheNames,
} from '../src/parts/TestStorage/TestStorage.ts'

test('clearTrelloTestCaches deletes only test cache names', async () => {
  const deleted: string[] = []
  const cacheStorage = {
    async delete(cacheName: string): Promise<boolean> {
      deleted.push(cacheName)
      return true
    },
  } as unknown as CacheStorage

  await clearTrelloTestCaches(cacheStorage)

  expect(deleted).toEqual([...testCacheNames])
  expect(deleted).toContain(testCredentialCacheName)
  expect(deleted).not.toContain(credentialCacheName)
})
