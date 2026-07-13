import type {
  TrelloBoard,
  TrelloBoardDetail,
  TrelloCard,
  TrelloCardDetail,
  TrelloComment,
  TrelloCredentials,
  TrelloLabel,
  TrelloSearchResult,
} from '../TrelloTypes/TrelloTypes.ts'
import type {
  FetchLike,
  TrelloCacheFirstResult,
  TrelloClient,
} from './TrelloClientTypes.ts'
import { addCardComment } from './operations/AddCardComment.ts'
import { addCardLabel } from './operations/AddCardLabel.ts'
import { createCard } from './operations/CreateCard.ts'
import { createList } from './operations/CreateList.ts'
import {
  getBoardDetail,
  readCachedBoardDetail,
} from './operations/GetBoardDetail.ts'
import {
  getCardDetail,
  getCardDetailAttachments,
  getCardDetailCard,
  getCardDetailComments,
  readCachedCardDetail,
} from './operations/GetCardDetail.ts'
import { listBoardLabels } from './operations/ListBoardLabels.ts'
import { listBoards, readCachedListBoards } from './operations/ListBoards.ts'
import { moveCard } from './operations/MoveCard.ts'
import { readCachedSearch, search } from './operations/Search.ts'
import { updateCard } from './operations/UpdateCard.ts'
import { updateList } from './operations/UpdateList.ts'
import {
  createCacheStorageTrelloApiCache,
  type TrelloApiCache,
} from './TrelloApiCache.ts'

export type { FetchLike, TrelloClient } from './TrelloClientTypes.ts'

export const createTrelloClient = (
  fetchLike: FetchLike = fetch,
  cache: TrelloApiCache | undefined = createCacheStorageTrelloApiCache(),
): TrelloClient => {
  return {
    addCardComment(
      card: TrelloCard,
      text: string,
      credentials: TrelloCredentials,
    ): Promise<TrelloComment> {
      return addCardComment(fetchLike, card, text, credentials, cache)
    },
    addCardLabel(
      card: TrelloCard,
      label: TrelloLabel,
      credentials: TrelloCredentials,
    ): ReturnType<TrelloClient['addCardLabel']> {
      return addCardLabel(fetchLike, card, label, credentials, cache)
    },
    createCard(
      list,
      create,
      credentials,
    ): ReturnType<TrelloClient['createCard']> {
      return createCard(fetchLike, list, create, credentials, cache)
    },
    createList(
      board: TrelloBoard,
      create,
      credentials,
    ): ReturnType<TrelloClient['createList']> {
      return createList(fetchLike, board, create, credentials, cache)
    },
    getBoardDetail(
      board,
      credentials,
    ): ReturnType<TrelloClient['getBoardDetail']> {
      return getBoardDetail(fetchLike, board, credentials, cache)
    },
    async getBoardDetailCacheFirst(
      board: TrelloBoard,
      credentials: TrelloCredentials,
    ): Promise<TrelloCacheFirstResult<TrelloBoardDetail>> {
      return {
        cached: await readCachedBoardDetail(cache, board, credentials),
        fresh: getBoardDetail(fetchLike, board, credentials, cache),
      }
    },
    getCardDetail(
      card,
      credentials,
    ): ReturnType<TrelloClient['getCardDetail']> {
      return getCardDetail(fetchLike, card, credentials, cache)
    },
    async getCardDetailCacheFirst(
      card: TrelloCard,
      credentials: TrelloCredentials,
    ): Promise<TrelloCacheFirstResult<TrelloCardDetail>> {
      return {
        cached: await readCachedCardDetail(cache, card, credentials),
        fresh: getCardDetail(fetchLike, card, credentials, cache),
      }
    },
    async getCardDetailPartsCacheFirst(
      card: TrelloCard,
      credentials: TrelloCredentials,
    ): ReturnType<TrelloClient['getCardDetailPartsCacheFirst']> {
      return {
        cached: await readCachedCardDetail(cache, card, credentials),
        fresh: {
          attachments: getCardDetailAttachments(
            fetchLike,
            card,
            credentials,
            cache,
          ),
          card: getCardDetailCard(fetchLike, card, credentials, cache),
          comments: getCardDetailComments(fetchLike, card, credentials, cache),
        },
      }
    },
    listBoardLabels(
      board,
      credentials,
    ): ReturnType<TrelloClient['listBoardLabels']> {
      return listBoardLabels(fetchLike, board, credentials, cache)
    },
    listBoards(credentials): ReturnType<TrelloClient['listBoards']> {
      return listBoards(fetchLike, credentials, cache)
    },
    async listBoardsCacheFirst(
      credentials,
    ): ReturnType<TrelloClient['listBoardsCacheFirst']> {
      return {
        cached: await readCachedListBoards(cache, credentials),
        fresh: listBoards(fetchLike, credentials, cache),
      }
    },
    moveCard(card, move, credentials): ReturnType<TrelloClient['moveCard']> {
      return moveCard(fetchLike, card, move, credentials, cache)
    },
    search(query, credentials): ReturnType<TrelloClient['search']> {
      return search(fetchLike, query, credentials, cache)
    },
    async searchCacheFirst(
      query: string,
      credentials: TrelloCredentials,
    ): Promise<TrelloCacheFirstResult<readonly TrelloSearchResult[]>> {
      return {
        cached: await readCachedSearch(cache, query, credentials),
        fresh: search(fetchLike, query, credentials, cache),
      }
    },
    updateCard(
      card,
      update,
      credentials,
    ): ReturnType<TrelloClient['updateCard']> {
      return updateCard(fetchLike, card, update, credentials, cache)
    },
    updateList(
      list,
      update,
      credentials,
    ): ReturnType<TrelloClient['updateList']> {
      return updateList(fetchLike, list, update, credentials)
    },
  }
}
