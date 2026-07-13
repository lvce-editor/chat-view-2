export const localCacheOrigin = 'https://trello.com'

export const createLocalCacheRequestUrl = (path: string): string => {
  return new URL(path, localCacheOrigin).href
}

export const matchLocalCacheRequest = async (
  cache: Readonly<Cache>,
  requestUrl: string,
  legacyRequestUrl: string,
): Promise<Response | undefined> => {
  const response = await cache.match(requestUrl)
  if (response) {
    return response
  }
  try {
    return await cache.match(legacyRequestUrl)
  } catch {
    return undefined
  }
}

export const deleteLocalCacheRequest = async (
  cache: Readonly<Cache>,
  requestUrl: string,
  legacyRequestUrl: string,
): Promise<void> => {
  await cache.delete(requestUrl)
  try {
    await cache.delete(legacyRequestUrl)
  } catch {
    // Legacy relative cache keys can resolve to unsupported Electron schemes.
  }
}
