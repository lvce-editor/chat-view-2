import type { ViewEvent } from '@lvce-editor/api'
import type { TrelloViewActionContext } from '../state/TrelloViewState.ts'
import { startAddCard } from './AddCard.ts'
import {
  addCardLabel,
  closeCardLabelPicker,
  openCardLabelPicker,
} from './AddCardLabel.ts'
import {
  cancelWriteComment,
  startWriteComment,
  submitComment,
} from './AddComment.ts'
import { startAddList } from './AddList.ts'
import { closeCardDetail } from './CloseCardDetail.ts'
import { connect } from './Connect.ts'
import { editCardDescription, editCardTitle } from './EditCardDetail.ts'
import { goBackToBoards } from './GoBackToBoards.ts'
import { loadBoards } from './LoadBoards.ts'
import { logout } from './Logout.ts'
import { openBoard } from './OpenBoard.ts'
import { openCard } from './OpenCard.ts'
import { saveCardDetail } from './SaveCardDetail.ts'

export const handleClickEvent = async (
  context: TrelloViewActionContext,
  event: Readonly<ViewEvent>,
): Promise<void> => {
  if (event.name === 'cardTitle' || event.name === 'editCardTitle') {
    editCardTitle(context)
    return
  }
  if (event.name?.startsWith('addCard:')) {
    startAddCard(context, event.name.slice('addCard:'.length))
    return
  }
  if (event.name?.startsWith('addCardLabel:')) {
    await addCardLabel(context, event.name.slice('addCardLabel:'.length))
    return
  }
  switch (event.name) {
    case 'backToBoards':
      await goBackToBoards(context)
      return
    case 'cancelWriteComment':
      cancelWriteComment(context)
      return
    case 'closeCardDetail':
      closeCardDetail(context)
      return
    case 'closeCardLabelPicker':
      closeCardLabelPicker(context)
      return
    case 'connect':
      await connect(context)
      return
    case 'editCardDescription':
      editCardDescription(context)
      return
    case 'logout':
      await logout(context)
      return
    case 'openCardLabelPicker':
      await openCardLabelPicker(context)
      return
    case 'refreshBoards':
      await loadBoards(context)
      return
    case 'saveCardDetail':
      await saveCardDetail(context)
      return
    case 'startAddList':
      startAddList(context)
      return
    case 'startWriteComment':
      startWriteComment(context)
      return
    case 'submitComment':
      await submitComment(context)
      return
    default:
      if (event.name?.startsWith('board:')) {
        await openBoard(context, event.name.slice('board:'.length))
        return
      }
      if (event.name?.startsWith('card:')) {
        await openCard(context, event.name.slice('card:'.length))
      }
  }
}
