import type {
  TrelloBoard,
  TrelloBoardDetail,
  TrelloCredentials,
  TrelloList,
  TrelloCard,
} from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloApiCache } from '../TrelloApiCache.ts'
import type { FetchLike } from '../TrelloClientTypes.ts'
import {
  deleteCachedJson,
  readCachedJson,
  requestJson,
} from '../RequestJson.ts'

const listParams = {
  fields: 'name',
} as const

const cardsParams = {
  attachment_fields: 'name,url,mimeType,previews',
  attachments: 'cover',
  fields: 'name,url,idBoard,idList,badges,cover,labels',
} as const

export const deleteCachedBoardLists = async (
  cache: TrelloApiCache | undefined,
  boardId: string,
  credentials: TrelloCredentials,
): Promise<void> => {
  await deleteCachedJson(
    cache,
    `/boards/${boardId}/lists`,
    credentials,
    listParams,
  )
}

export const deleteCachedListCards = async (
  cache: TrelloApiCache | undefined,
  listId: string,
  credentials: TrelloCredentials,
): Promise<void> => {
  await deleteCachedJson(
    cache,
    `/lists/${listId}/cards`,
    credentials,
    cardsParams,
  )
}

export const readCachedBoardDetail = async (
  cache: TrelloApiCache | undefined,
  board: TrelloBoard,
  credentials: TrelloCredentials,
): Promise<TrelloBoardDetail | undefined> => {
  const lists = await readCachedJson<readonly Omit<TrelloList, 'cards'>[]>(
    cache,
    `/boards/${board.id}/lists`,
    credentials,
    listParams,
  )
  if (!lists) {
    return undefined
  }
  const cardsByList = await Promise.all(
    lists.map((list) => {
      return readCachedJson<readonly TrelloCard[]>(
        cache,
        `/lists/${list.id}/cards`,
        credentials,
        cardsParams,
      )
    }),
  )
  if (cardsByList.some((cards) => !cards)) {
    return undefined
  }
  return {
    board,
    lists: lists.map((list, index) => {
      return {
        cards: cardsByList[index] || [],
        id: list.id,
        name: list.name,
      }
    }),
  }
}

export const getBoardDetail = async (
  fetchLike: FetchLike,
  board: TrelloBoard,
  credentials: TrelloCredentials,
  cache?: TrelloApiCache,
): Promise<TrelloBoardDetail> => {
  const lists = await requestJson<readonly Omit<TrelloList, 'cards'>[]>(
    fetchLike,
    `/boards/${board.id}/lists`,
    credentials,
    listParams,
    undefined,
    cache,
  )
  const listsWithCards = await Promise.all(
    lists.map(async (list): Promise<TrelloList> => {
      const cards = await requestJson<readonly TrelloCard[]>(
        fetchLike,
        `/lists/${list.id}/cards`,
        credentials,
        cardsParams,
        undefined,
        cache,
      )
      return {
        cards,
        id: list.id,
        name: list.name,
      }
    }),
  )
  return {
    board,
    lists: listsWithCards,
  }
}
