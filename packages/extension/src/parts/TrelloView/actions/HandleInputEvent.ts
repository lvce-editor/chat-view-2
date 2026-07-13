import type { ViewEvent } from '@lvce-editor/api'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { moveCardToList } from './MoveCardToList.ts'

export const handleInputEvent = async (
  context: TrelloViewActionContext,
  event: Readonly<ViewEvent>,
): Promise<void> => {
  const { state } = context
  const mutableState = state as TrelloViewState
  const value = typeof event.value === 'string' ? event.value : ''
  if (event.name?.startsWith('cardList:')) {
    await moveCardToList(context, event.name.slice('cardList:'.length), value)
    return
  }
  if (event.name?.startsWith('newCardTitle:')) {
    mutableState.draftNewCardTitle = value
    return
  }
  switch (event.name) {
    case 'apiKey':
      mutableState.draftApiKey = value
      return
    case 'cardComment':
      mutableState.draftComment = value
      return
    case 'cardDescription':
      mutableState.draftCardDescription = value
      return
    case 'cardLabelSearch':
      mutableState.draftLabelSearchQuery = value
      return
    case 'cardTitle':
      mutableState.draftCardTitle = value
      return
    case 'newListTitle':
      mutableState.draftNewListTitle = value
      return
    case 'search':
      mutableState.draftSearchQuery = value
      return
    case 'token':
      mutableState.draftToken = value
      return
    default:
      if (event.name?.startsWith('listTitle:')) {
        const listId = event.name.slice('listTitle:'.length)
        mutableState.draftListTitles = {
          ...mutableState.draftListTitles,
          [listId]: value,
        }
      }
  }
}
