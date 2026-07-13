// cspell:ignore prefs

import type {
  TrelloCredentials,
  TrelloSearchResult,
} from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloApiCache } from '../TrelloApiCache.ts'
import type { FetchLike } from '../TrelloClientTypes.ts'
import {
  normalizeSearchResponse,
  type TrelloSearchResponse,
} from '../NormalizeSearchResponse.ts'
import { readCachedJson, requestJson } from '../RequestJson.ts'

const getSearchParams = (query: string): Readonly<Record<string, string>> => {
  return {
    board_fields: 'name,url,prefs',
    boards_limit: '10',
    card_fields: 'name,url,idBoard',
    cards_limit: '10',
    modelTypes: 'cards,boards',
    query,
  }
}

export const readCachedSearch = async (
  cache: TrelloApiCache | undefined,
  query: string,
  credentials: TrelloCredentials,
): Promise<readonly TrelloSearchResult[] | undefined> => {
  const response = await readCachedJson<TrelloSearchResponse>(
    cache,
    '/search',
    credentials,
    getSearchParams(query),
  )
  if (!response) {
    return undefined
  }
  return normalizeSearchResponse(response)
}

export const search = async (
  fetchLike: FetchLike,
  query: string,
  credentials: TrelloCredentials,
  cache?: TrelloApiCache,
): Promise<readonly TrelloSearchResult[]> => {
  const response = await requestJson<TrelloSearchResponse>(
    fetchLike,
    '/search',
    credentials,
    getSearchParams(query),
    undefined,
    cache,
  )
  return normalizeSearchResponse(response)
}
