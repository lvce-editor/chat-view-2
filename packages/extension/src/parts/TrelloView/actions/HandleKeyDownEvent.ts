import type { ViewEvent } from '@lvce-editor/api'
import type { TrelloViewActionContext } from '../state/TrelloViewState.ts'
import { cancelAddCard } from './AddCard.ts'
import { cancelWriteComment, submitComment } from './AddComment.ts'
import { cancelAddList } from './AddList.ts'

const getEventString = (event: Readonly<ViewEvent>, key: string): string => {
  const value = (event as unknown as Readonly<Record<string, unknown>>)[key]
  if (typeof value === 'string') {
    return value
  }
  return ''
}

const getEventBoolean = (event: Readonly<ViewEvent>, key: string): boolean => {
  const value = (event as unknown as Readonly<Record<string, unknown>>)[key]
  return value === true
}

export const handleKeyDownEvent = async (
  context: TrelloViewActionContext,
  event: Readonly<ViewEvent>,
): Promise<void> => {
  const key = getEventString(event, 'key') || getEventString(event, 'code')
  if (
    event.name === 'cardComment' &&
    key === 'Enter' &&
    getEventBoolean(event, 'ctrlKey')
  ) {
    await submitComment(context)
    return
  }
  if (key !== 'Escape') {
    return
  }
  if (event.name?.startsWith('newCardTitle:')) {
    cancelAddCard(context)
    return
  }
  if (event.name === 'newListTitle') {
    cancelAddList(context)
    return
  }
  if (event.name === 'cardComment') {
    cancelWriteComment(context)
  }
}
