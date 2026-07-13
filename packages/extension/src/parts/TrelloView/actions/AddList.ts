import type { TrelloList } from '../../TrelloTypes/TrelloTypes.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'

const addListFormName = 'addList'

const appendList = (
  state: Readonly<TrelloViewState>,
  list: TrelloList,
): void => {
  if (!state.boardDetail) {
    return
  }
  const mutableState = state as TrelloViewState
  mutableState.boardDetail = {
    ...state.boardDetail,
    lists: [...state.boardDetail.lists, list],
  }
}

export const startAddList = (
  context: Readonly<TrelloViewActionContext>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  state.addingList = true
  state.draftNewListTitle = ''
  state.focusedName = 'newListTitle'
  state.savingNewList = false
  state.error = ''
  requestRerender()
}

export const cancelAddList = (
  context: Readonly<TrelloViewActionContext>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  state.addingList = false
  state.draftNewListTitle = ''
  state.savingNewList = false
  state.error = ''
  requestRerender()
}

export const submitAddList = async (
  context: Readonly<TrelloViewActionContext>,
  formName: string | undefined,
): Promise<boolean> => {
  if (formName !== addListFormName) {
    return false
  }
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials || !state.boardDetail || state.savingNewList) {
    return true
  }
  const name = state.draftNewListTitle.trim()
  state.addingList = true
  if (!name) {
    state.error = 'List title is required.'
    requestRerender()
    return true
  }
  state.savingNewList = true
  state.error = ''
  requestRerender()
  try {
    const list = await client.createList(
      state.boardDetail.board,
      {
        name,
        pos: 'bottom',
      },
      state.credentials,
    )
    appendList(state, list)
    state.addingList = false
    state.draftNewListTitle = ''
    state.error = ''
  } catch (error) {
    state.error = getErrorMessage(error)
  }
  state.savingNewList = false
  requestRerender()
  return true
}
