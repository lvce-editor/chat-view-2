import type {
  TrelloBoard,
  TrelloCredentials,
  TrelloLabel,
} from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloApiCache } from '../TrelloApiCache.ts'
import type { FetchLike } from '../TrelloClientTypes.ts'
import { requestJson } from '../RequestJson.ts'

const labelParams = {
  fields: 'name,color,idBoard',
  limit: '1000',
} as const

export const listBoardLabels = (
  fetchLike: FetchLike,
  board: TrelloBoard,
  credentials: TrelloCredentials,
  cache?: TrelloApiCache,
): Promise<readonly TrelloLabel[]> => {
  return requestJson<readonly TrelloLabel[]>(
    fetchLike,
    `/boards/${board.id}/labels`,
    credentials,
    labelParams,
    undefined,
    cache,
  )
}
