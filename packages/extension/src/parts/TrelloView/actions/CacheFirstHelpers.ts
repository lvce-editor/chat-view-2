import type { TrelloCardDetail } from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloViewState } from '../state/TrelloViewState.ts'

export const isSameJson = (a: unknown, b: unknown): boolean => {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const applyCardDetail = (
  state: Readonly<TrelloViewState>,
  cardDetail: TrelloCardDetail,
): void => {
  const mutableState = state as TrelloViewState
  mutableState.selectedCardDetail = cardDetail
  mutableState.draftCardTitle = cardDetail.card.name
  mutableState.draftCardDescription = cardDetail.card.desc || ''
  mutableState.editingCardDescription = false
  mutableState.editingCardTitle = false
}
