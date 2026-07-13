import type { TrelloCard } from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloViewState } from '../state/TrelloViewState.ts'

export const updateBoardDetailCard = (
  state: Readonly<TrelloViewState>,
  card: TrelloCard,
): void => {
  const mutableState = state as TrelloViewState
  if (!mutableState.boardDetail) {
    return
  }
  mutableState.boardDetail = {
    ...mutableState.boardDetail,
    lists: mutableState.boardDetail.lists.map((list) => {
      return {
        ...list,
        cards: list.cards.map((item) => {
          if (item.id !== card.id) {
            return item
          }
          return {
            ...item,
            ...card,
          }
        }),
      }
    }),
  }
}
