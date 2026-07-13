import type { ViewEvent } from '@lvce-editor/api'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { findBoardCard } from './FindBoardCard.ts'
import { moveCardToList } from './MoveCardToList.ts'

const cardPrefix = 'card:'
const listPrefix = 'list:'

const getEventString = (event: Readonly<ViewEvent>, key: string): string => {
  const value = (event as unknown as Readonly<Record<string, unknown>>)[key]
  return typeof value === 'string' ? value : ''
}

const getCardIdFromName = (name: string | undefined): string => {
  if (!name?.startsWith(cardPrefix)) {
    return ''
  }
  return name.slice(cardPrefix.length)
}

const getListIdFromName = (name: string | undefined): string => {
  if (!name?.startsWith(listPrefix)) {
    return ''
  }
  return name.slice(listPrefix.length)
}

const getDroppedCardId = (
  state: Readonly<TrelloViewState>,
  event: Readonly<ViewEvent>,
): string => {
  const value = getEventString(event, 'value')
  if (value) {
    return value
  }
  const data = getEventString(event, 'data')
  if (data) {
    return data
  }
  const text = getEventString(event, 'text')
  if (text) {
    return text
  }
  return state.draggedCardId
}

const clearDragState = (state: Readonly<TrelloViewState>): void => {
  const mutableState = state as TrelloViewState
  mutableState.draggedCardId = ''
  mutableState.dragTargetListId = ''
}

export const handleDragStartEvent = (
  context: TrelloViewActionContext,
  event: Readonly<ViewEvent>,
): void => {
  const state = context.state as TrelloViewState
  const cardId = getCardIdFromName(event.name)
  state.draggedCardId = cardId
  state.dragTargetListId = ''
}

export const handleDragOverEvent = (
  context: TrelloViewActionContext,
  event: Readonly<ViewEvent>,
): void => {
  const state = context.state as TrelloViewState
  const listId = getListIdFromName(event.name)
  if (state.dragTargetListId === listId) {
    return
  }
  state.dragTargetListId = listId
  context.requestRerender()
}

export const handleDragLeaveEvent = (
  context: TrelloViewActionContext,
): void => {
  const state = context.state as TrelloViewState
  if (!state.dragTargetListId) {
    return
  }
  state.dragTargetListId = ''
  context.requestRerender()
}

export const handleDragEndEvent = (context: TrelloViewActionContext): void => {
  clearDragState(context.state)
  context.requestRerender()
}

export const handleDropEvent = async (
  context: TrelloViewActionContext,
  event: Readonly<ViewEvent>,
): Promise<void> => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  const targetListId = getListIdFromName(event.name)
  const cardId = getDroppedCardId(state, event)
  const card = findBoardCard(state, cardId)
  if (!state.credentials || !targetListId || !card) {
    clearDragState(state)
    requestRerender()
    return
  }
  state.dragTargetListId = ''
  requestRerender()
  await moveCardToList(context, card.id, targetListId, 'top')
  clearDragState(state)
  requestRerender()
}
