import type { TrelloCredentials } from '../TrelloTypes/TrelloTypes.ts'
import type { TrelloApiCache } from './TrelloApiCache.ts'
import type {
  FetchLike,
  TrelloRequestInit,
  TrelloResponse,
} from './TrelloClientTypes.ts'

const baseUrl = 'https://api.trello.com/1'

const getErrorMessage = async (response: TrelloResponse): Promise<string> => {
  const text = await response.text()
  if (text) {
    return `Trello request failed: ${response.status} ${text}`
  }
  return `Trello request failed: ${response.status} ${response.statusText}`
}

const isGetRequest = (init?: TrelloRequestInit): boolean => {
  return !init?.method || init.method.toUpperCase() === 'GET'
}

export const createTrelloRequestUrl = (
  path: string,
  credentials: TrelloCredentials,
  params: Readonly<Record<string, string>> = {},
): string => {
  const url = new URL(`${baseUrl}${path}`)
  url.searchParams.set('key', credentials.apiKey)
  url.searchParams.set('token', credentials.token)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.href
}

export const readCachedJson = async <T>(
  cache: TrelloApiCache | undefined,
  path: string,
  credentials: TrelloCredentials,
  params: Readonly<Record<string, string>> = {},
): Promise<T | undefined> => {
  if (!cache) {
    return undefined
  }
  try {
    const requestUrl = createTrelloRequestUrl(path, credentials, params)
    return await cache.read<T>(requestUrl, credentials)
  } catch {
    return undefined
  }
}

export const deleteCachedJson = async (
  cache: TrelloApiCache | undefined,
  path: string,
  credentials: TrelloCredentials,
  params: Readonly<Record<string, string>> = {},
): Promise<void> => {
  if (!cache) {
    return
  }
  try {
    const requestUrl = createTrelloRequestUrl(path, credentials, params)
    await cache.delete(requestUrl, credentials)
  } catch {
    // Cache cleanup should not make a successful Trello write look failed.
  }
}

export const requestJson = async <T>(
  fetchLike: FetchLike,
  path: string,
  credentials: TrelloCredentials,
  params: Readonly<Record<string, string>> = {},
  init?: TrelloRequestInit,
  cache?: TrelloApiCache,
): Promise<T> => {
  const requestUrl = createTrelloRequestUrl(path, credentials, params)
  const response = await fetchLike(requestUrl, init)
  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }
  const value = (await response.json()) as T
  if (cache && isGetRequest(init)) {
    try {
      await cache.write(requestUrl, credentials, value)
    } catch {
      // A quota or Cache Storage failure should not fail a Trello request.
    }
  }
  return value
}
