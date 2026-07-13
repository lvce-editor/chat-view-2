import type { TrelloCredentials } from '../TrelloTypes/TrelloTypes.ts'
import {
  createLocalCacheRequestUrl,
  deleteLocalCacheRequest,
  matchLocalCacheRequest,
} from '../LocalCacheRequest/LocalCacheRequest.ts'

export interface CredentialStorage {
  readonly delete: () => Promise<void>
  readonly read: () => Promise<TrelloCredentials | undefined>
  readonly write: (credentials: TrelloCredentials) => Promise<void>
}

export const cacheName = 'builtin.trello.credentials'
export const testCacheName = 'test.builtin.trello.credentials'
const legacyCredentialsRequestUrl = '/credentials.json'
export const credentialsRequestUrl = createLocalCacheRequestUrl(
  legacyCredentialsRequestUrl,
)

const isCredentials = (value: unknown): value is TrelloCredentials => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.apiKey === 'string' && typeof record.token === 'string'
}

export const createCacheCredentialStorage = (
  selectedCacheName = cacheName,
): CredentialStorage => {
  return {
    async delete(): Promise<void> {
      const cache = await caches.open(selectedCacheName)
      await deleteLocalCacheRequest(
        cache,
        credentialsRequestUrl,
        legacyCredentialsRequestUrl,
      )
    },
    async read(): Promise<TrelloCredentials | undefined> {
      const cache = await caches.open(selectedCacheName)
      const response = await matchLocalCacheRequest(
        cache,
        credentialsRequestUrl,
        legacyCredentialsRequestUrl,
      )
      if (!response) {
        return undefined
      }
      const value = await response.json()
      if (!isCredentials(value)) {
        return undefined
      }
      return value
    },
    async write(credentials: TrelloCredentials): Promise<void> {
      const cache = await caches.open(selectedCacheName)
      await cache.put(credentialsRequestUrl, Response.json(credentials))
    },
  }
}

export const createMemoryCredentialStorage = (
  initial?: TrelloCredentials,
): CredentialStorage => {
  let value = initial
  return {
    async delete(): Promise<void> {
      value = undefined
    },
    async read(): Promise<TrelloCredentials | undefined> {
      return value
    },
    async write(credentials: TrelloCredentials): Promise<void> {
      value = credentials
    },
  }
}
