import type {
  TrelloCard,
  TrelloCardUpdate,
  TrelloCredentials,
} from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloApiCache } from '../TrelloApiCache.ts'
import type { FetchLike } from '../TrelloClientTypes.ts'
import { requestJson } from '../RequestJson.ts'
import { deleteCachedCardDetail } from './GetCardDetail.ts'

export const updateCard = async (
  fetchLike: FetchLike,
  card: TrelloCard,
  update: TrelloCardUpdate,
  credentials: TrelloCredentials,
  cache?: TrelloApiCache,
): Promise<TrelloCard> => {
  const updatedCard = await requestJson<TrelloCard>(
    fetchLike,
    `/cards/${card.id}`,
    credentials,
    {
      desc: update.desc,
      fields: 'name,desc,url,idBoard,idList,badges,cover',
      name: update.name,
    },
    {
      method: 'PUT',
    },
  )
  await deleteCachedCardDetail(cache, card, credentials)
  return updatedCard
}
