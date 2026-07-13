import type {
  TrelloCard,
  TrelloCardMove,
} from '../../TrelloTypes/TrelloTypes.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { findBoardCard } from './FindBoardCard.ts'

const getCardListId = (
  state: Readonly<TrelloViewState>,
  card: Readonly<TrelloCard>,
): string => {
  if (card.idList) {
    return card.idList
  }
  const lists = state.boardDetail?.lists || []
  const list = lists.find((item) => {
    return item.cards.some((listCard) => {
      return listCard.id === card.id
    })
  })
  return list?.id || ''
}

const moveBoardDetailCard = (
  state: Readonly<TrelloViewState>,
  card: Readonly<TrelloCard>,
  targetListId: string,
  position: TrelloCardMove['pos'],
): void => {
  const mutableState = state as TrelloViewState
  if (!mutableState.boardDetail) {
    return
  }
  mutableState.boardDetail = {
    ...mutableState.boardDetail,
    lists: mutableState.boardDetail.lists.map((list) => {
      const cardsWithoutMoved = list.cards.filter((item) => {
        return item.id !== card.id
      })
      if (list.id !== targetListId) {
        return {
          ...list,
          cards: cardsWithoutMoved,
        }
      }
      return {
        ...list,
        cards:
          position === 'top'
            ? [card, ...cardsWithoutMoved]
            : [...cardsWithoutMoved, card],
      }
    }),
  }
}

export const moveCardToList = async (
  context: TrelloViewActionContext,
  cardId: string,
  targetListId: string,
  position: TrelloCardMove['pos'] = 'bottom',
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  const card = findBoardCard(state, cardId)
  if (!state.credentials || !targetListId || !card || state.movingCardId) {
    return
  }
  const sourceListId = getCardListId(state, card)
  if (sourceListId === targetListId) {
    return
  }
  state.error = ''
  state.movingCardId = card.id
  requestRerender()
  try {
    const sourceCard = sourceListId
      ? {
          ...card,
          idList: sourceListId,
        }
      : card
    const movedCard = await client.moveCard(
      sourceCard,
      {
        idList: targetListId,
        pos: position,
      },
      state.credentials,
    )
    const mergedCard = {
      ...card,
      ...movedCard,
      idList: targetListId,
    }
    moveBoardDetailCard(state, mergedCard, targetListId, position)
    if (state.selectedCardDetail?.card.id === mergedCard.id) {
      state.selectedCardDetail = {
        ...state.selectedCardDetail,
        card: {
          ...state.selectedCardDetail.card,
          ...mergedCard,
        },
      }
    }
  } catch (error) {
    state.error = getErrorMessage(error)
  } finally {
    state.movingCardId = ''
  }
  requestRerender()
}
