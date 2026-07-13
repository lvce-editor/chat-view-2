import type { TrelloCard } from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloViewState } from '../state/TrelloViewState.ts'

export const findBoardCard = (
  state: Readonly<TrelloViewState>,
  cardId: string,
): TrelloCard | undefined => {
  const lists = state.boardDetail?.lists || []
  for (const list of lists) {
    const card = list.cards.find((item) => item.id === cardId)
    if (card) {
      return card
    }
  }
  return undefined
}
