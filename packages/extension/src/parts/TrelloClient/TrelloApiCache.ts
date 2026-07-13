import type { TrelloCredentials } from '../TrelloTypes/TrelloTypes.ts'

export interface TrelloApiCache {
  readonly delete: (
    requestUrl: string,
    credentials: TrelloCredentials,
  ) => Promise<void>
  readonly read: <T>(
    requestUrl: string,
    credentials: TrelloCredentials,
  ) => Promise<T | undefined>
  readonly write: <T>(
    requestUrl: string,
    credentials: TrelloCredentials,
    value: T,
  ) => Promise<void>
}

export interface MemoryTrelloApiCache extends TrelloApiCache {
  readonly keys: () => readonly string[]
}

export const trelloApiCacheName = 'builtin.trello.api-responses'
export const testTrelloApiCacheName = 'test.builtin.trello.api-responses'
export const credentialFingerprintSearchParam = 'credential'

const textEncoder = new TextEncoder()

const getCredentialFingerprint = async (
  credentials: TrelloCredentials,
): Promise<string | undefined> => {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    return undefined
  }
  const value = textEncoder.encode(`${credentials.apiKey}:${credentials.token}`)
  const digest = await subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(digest), (byte) => {
    return byte.toString(16).padStart(2, '0')
  }).join('')
}

export const createTrelloApiCacheRequestUrl = async (
  requestUrl: string,
  credentials: TrelloCredentials,
): Promise<string | undefined> => {
  const credentialFingerprint = await getCredentialFingerprint(credentials)
  if (!credentialFingerprint) {
    return undefined
  }
  const url = new URL(requestUrl)
  url.searchParams.delete('key')
  url.searchParams.delete('token')
  url.searchParams.set(credentialFingerprintSearchParam, credentialFingerprint)
  url.searchParams.sort()
  return url.href
}

export const createCacheStorageTrelloApiCache = (
  cacheStorage: Readonly<CacheStorage> | undefined = globalThis.caches,
  selectedCacheName = trelloApiCacheName,
): TrelloApiCache | undefined => {
  if (!cacheStorage) {
    return undefined
  }
  return {
    async delete(
      requestUrl: string,
      credentials: TrelloCredentials,
    ): Promise<void> {
      const cacheRequestUrl = await createTrelloApiCacheRequestUrl(
        requestUrl,
        credentials,
      )
      if (!cacheRequestUrl) {
        return
      }
      const cache = await cacheStorage.open(selectedCacheName)
      await cache.delete(cacheRequestUrl)
    },
    async read<T>(
      requestUrl: string,
      credentials: TrelloCredentials,
    ): Promise<T | undefined> {
      const cacheRequestUrl = await createTrelloApiCacheRequestUrl(
        requestUrl,
        credentials,
      )
      if (!cacheRequestUrl) {
        return undefined
      }
      const cache = await cacheStorage.open(selectedCacheName)
      const response = await cache.match(cacheRequestUrl)
      if (!response) {
        return undefined
      }
      return response.json() as Promise<T>
    },
    async write<T>(
      requestUrl: string,
      credentials: TrelloCredentials,
      value: T,
    ): Promise<void> {
      const cacheRequestUrl = await createTrelloApiCacheRequestUrl(
        requestUrl,
        credentials,
      )
      if (!cacheRequestUrl) {
        return
      }
      const cache = await cacheStorage.open(selectedCacheName)
      await cache.put(cacheRequestUrl, Response.json(value))
    },
  }
}

export const createMemoryTrelloApiCache = (): MemoryTrelloApiCache => {
  const values = new Map<string, unknown>()
  return {
    async delete(
      requestUrl: string,
      credentials: TrelloCredentials,
    ): Promise<void> {
      const cacheRequestUrl = await createTrelloApiCacheRequestUrl(
        requestUrl,
        credentials,
      )
      if (cacheRequestUrl) {
        values.delete(cacheRequestUrl)
      }
    },
    keys(): readonly string[] {
      return values.keys().toArray()
    },
    async read<T>(
      requestUrl: string,
      credentials: TrelloCredentials,
    ): Promise<T | undefined> {
      const cacheRequestUrl = await createTrelloApiCacheRequestUrl(
        requestUrl,
        credentials,
      )
      if (!cacheRequestUrl || !values.has(cacheRequestUrl)) {
        return undefined
      }
      return values.get(cacheRequestUrl) as T
    },
    async write<T>(
      requestUrl: string,
      credentials: TrelloCredentials,
      value: T,
    ): Promise<void> {
      const cacheRequestUrl = await createTrelloApiCacheRequestUrl(
        requestUrl,
        credentials,
      )
      if (cacheRequestUrl) {
        values.set(cacheRequestUrl, value)
      }
    },
  }
}
