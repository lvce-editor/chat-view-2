import type {
  TrelloBoard,
  TrelloCredentials,
  TrelloList,
  TrelloListCreate,
} from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloApiCache } from '../TrelloApiCache.ts'
import type { FetchLike } from '../TrelloClientTypes.ts'
import { requestJson } from '../RequestJson.ts'
import { deleteCachedBoardLists } from './GetBoardDetail.ts'

export const createList = async (
  fetchLike: FetchLike,
  board: TrelloBoard,
  create: TrelloListCreate,
  credentials: TrelloCredentials,
  cache?: TrelloApiCache,
): Promise<TrelloList> => {
  const list = await requestJson<Omit<TrelloList, 'cards'>>(
    fetchLike,
    '/lists',
    credentials,
    {
      fields: 'name',
      idBoard: board.id,
      name: create.name,
      pos: create.pos,
    },
    {
      method: 'POST',
    },
  )
  await deleteCachedBoardLists(cache, board.id, credentials)
  return {
    ...list,
    cards: [],
  }
}
