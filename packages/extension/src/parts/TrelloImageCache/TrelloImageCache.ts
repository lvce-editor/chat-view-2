export interface TrelloImageCache {
  readonly dispose: () => void
  readonly resolveImageUrl: (url: string) => Promise<string>
}

export const trelloImageCacheName = 'builtin.trello.images'
export const testTrelloImageCacheName = 'test.builtin.trello.images'

type FetchImage = (input: string) => Promise<Response>

const createObjectUrl = (blob: Blob): string => {
  return URL.createObjectURL(blob)
}

const revokeObjectUrl = (url: string): void => {
  URL.revokeObjectURL(url)
}

const getCachedResponse = async (
  cache: Readonly<Cache> | undefined,
  url: string,
): Promise<Response | undefined> => {
  if (!cache) {
    return undefined
  }
  return cache.match(url)
}

const writeCachedResponse = async (
  cache: Readonly<Cache> | undefined,
  url: string,
  response: Response,
): Promise<void> => {
  if (!cache) {
    return
  }
  try {
    await cache.put(url, response.clone())
  } catch {
    // Image caching is best-effort; rendering can still use this response.
  }
}

export const createTrelloImageCache = (
  cacheStorage: Readonly<CacheStorage> | undefined = globalThis.caches,
  fetchImage: FetchImage = fetch,
  selectedCacheName = trelloImageCacheName,
): TrelloImageCache => {
  const objectUrls = new Map<string, string>()
  const pendingObjectUrls = new Map<string, Promise<string>>()

  const openCache = async (): Promise<Cache | undefined> => {
    if (!cacheStorage) {
      return undefined
    }
    return cacheStorage.open(selectedCacheName)
  }

  return {
    dispose(): void {
      for (const objectUrl of objectUrls.values()) {
        revokeObjectUrl(objectUrl)
      }
      objectUrls.clear()
      pendingObjectUrls.clear()
    },
    async resolveImageUrl(url: string): Promise<string> {
      const existing = objectUrls.get(url)
      if (existing) {
        return existing
      }
      const pending = pendingObjectUrls.get(url)
      if (pending) {
        return pending
      }
      const pendingObjectUrl = (async (): Promise<string> => {
        const cache = await openCache()
        const cachedResponse = await getCachedResponse(cache, url)
        const response = cachedResponse || (await fetchImage(url))
        if (!response.ok) {
          return ''
        }
        if (!cachedResponse) {
          await writeCachedResponse(cache, url, response)
        }
        const blob = await response.blob()
        const objectUrl = createObjectUrl(blob)
        objectUrls.set(url, objectUrl)
        return objectUrl
      })()
      pendingObjectUrls.set(url, pendingObjectUrl)
      try {
        return await pendingObjectUrl
      } finally {
        pendingObjectUrls.delete(url)
      }
    },
  }
}
