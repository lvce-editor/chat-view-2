import type { TrelloCard, TrelloList } from '../../TrelloTypes/TrelloTypes.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'

const addCardPrefix = 'addCard:'

const findList = (
  state: Readonly<TrelloViewState>,
  listId: string,
): TrelloList | undefined => {
  return state.boardDetail?.lists.find((list) => {
    return list.id === listId
  })
}

const appendCardToList = (
  state: Readonly<TrelloViewState>,
  listId: string,
  card: TrelloCard,
): void => {
  if (!state.boardDetail) {
    return
  }
  const mutableState = state as TrelloViewState
  mutableState.boardDetail = {
    ...state.boardDetail,
    lists: state.boardDetail.lists.map((list) => {
      if (list.id !== listId) {
        return list
      }
      return {
        ...list,
        cards: [...list.cards, card],
      }
    }),
  }
}

export const startAddCard = (
  context: Readonly<TrelloViewActionContext>,
  listId: string,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  state.addingCardListId = listId
  state.draftNewCardTitle = ''
  state.focusedName = `newCardTitle:${listId}`
  state.savingNewCard = false
  state.error = ''
  requestRerender()
}

export const cancelAddCard = (
  context: Readonly<TrelloViewActionContext>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  state.addingCardListId = ''
  state.draftNewCardTitle = ''
  state.savingNewCard = false
  state.error = ''
  requestRerender()
}

export const submitAddCard = async (
  context: Readonly<TrelloViewActionContext>,
  formName: string | undefined,
): Promise<void> => {
  if (!formName?.startsWith(addCardPrefix)) {
    return
  }
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials || !state.boardDetail || state.savingNewCard) {
    return
  }
  const listId = formName.slice(addCardPrefix.length)
  const list = findList(state, listId)
  if (!list) {
    return
  }
  const name = state.draftNewCardTitle.trim()
  state.addingCardListId = listId
  if (!name) {
    state.error = 'Card title is required.'
    requestRerender()
    return
  }
  state.savingNewCard = true
  state.focusedName = ''
  state.error = ''
  requestRerender()
  try {
    const card = await client.createCard(
      list,
      {
        name,
        pos: 'bottom',
      },
      state.credentials,
    )
    appendCardToList(state, listId, card)
    state.addingCardListId = listId
    state.draftNewCardTitle = ''
    state.focusedName = `newCardTitle:${listId}`
    state.error = ''
  } catch (error) {
    state.focusedName = `newCardTitle:${listId}`
    state.error = getErrorMessage(error)
  }
  state.savingNewCard = false
  requestRerender()
}
