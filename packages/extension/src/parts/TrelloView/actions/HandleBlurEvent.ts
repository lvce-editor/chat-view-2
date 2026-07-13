import type { ViewEvent } from '@lvce-editor/api'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { closeCardLabelPicker } from './AddCardLabel.ts'
import { saveCardDetail } from './SaveCardDetail.ts'
import { updateBoardDetailCard } from './UpdateBoardDetailCard.ts'
import { updateBoardDetailList } from './UpdateBoardDetailList.ts'

const listTitlePrefix = 'listTitle:'

const handleCardTitleBlur = async (
  context: Readonly<TrelloViewActionContext>,
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials || !state.selectedCardDetail) {
    return
  }
  const { card } = state.selectedCardDetail
  const name = state.draftCardTitle.trim()
  state.editingCardTitle = false
  if (!name) {
    state.draftCardTitle = card.name
    state.error = 'Card title is required.'
    requestRerender()
    return
  }
  if (name === card.name) {
    state.draftCardTitle = card.name
    requestRerender()
    return
  }
  state.error = ''
  try {
    const updatedCard = await client.updateCard(
      card,
      {
        desc: card.desc || '',
        name,
      },
      state.credentials,
    )
    const mergedCard = {
      ...card,
      ...updatedCard,
    }
    state.selectedCardDetail = {
      ...state.selectedCardDetail,
      card: mergedCard,
    }
    state.draftCardTitle = mergedCard.name
    state.draftCardDescription = mergedCard.desc || ''
    updateBoardDetailCard(state, mergedCard)
  } catch (error) {
    state.draftCardTitle = card.name
    state.error = getErrorMessage(error)
  }
  requestRerender()
}

const handleListTitleBlur = async (
  context: Readonly<TrelloViewActionContext>,
  event: Readonly<ViewEvent>,
): Promise<void> => {
  if (!event.name?.startsWith(listTitlePrefix)) {
    return
  }
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials || !state.boardDetail) {
    return
  }
  const listId = event.name.slice(listTitlePrefix.length)
  const list = state.boardDetail.lists.find((item) => {
    return item.id === listId
  })
  if (!list) {
    return
  }
  const draft = state.draftListTitles[listId] ?? list.name
  const name = draft.trim()
  if (!name) {
    state.draftListTitles = {
      ...state.draftListTitles,
      [listId]: list.name,
    }
    state.error = 'List title is required.'
    requestRerender()
    return
  }
  if (name === list.name) {
    state.draftListTitles = {
      ...state.draftListTitles,
      [listId]: list.name,
    }
    return
  }
  state.error = ''
  try {
    const updatedList = await client.updateList(
      list,
      {
        name,
      },
      state.credentials,
    )
    state.draftListTitles = {
      ...state.draftListTitles,
      [listId]: updatedList.name,
    }
    updateBoardDetailList(state, updatedList)
  } catch (error) {
    state.draftListTitles = {
      ...state.draftListTitles,
      [listId]: list.name,
    }
    state.error = getErrorMessage(error)
  }
  requestRerender()
}

export const handleBlurEvent = async (
  context: Readonly<TrelloViewActionContext>,
  event: Readonly<ViewEvent>,
): Promise<void> => {
  if (event.name === 'cardTitle') {
    await handleCardTitleBlur(context)
    return
  }
  if (event.name === 'cardDescription') {
    await saveCardDetail(context)
    return
  }
  if (event.name === 'cardLabelSearch') {
    closeCardLabelPicker(context)
    return
  }
  await handleListTitleBlur(context, event)
}
