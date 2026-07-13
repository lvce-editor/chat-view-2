import type { TrelloCard } from '../../TrelloTypes/TrelloTypes.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { updateBoardDetailCard } from './UpdateBoardDetailCard.ts'

const updateCardCommentCount = (card: Readonly<TrelloCard>): TrelloCard => {
  const count = card.badges?.comments || 0
  return {
    ...card,
    badges: {
      ...card.badges,
      comments: count + 1,
    },
  }
}

export const startWriteComment = (
  context: Readonly<TrelloViewActionContext>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.selectedCardDetail) {
    return
  }
  state.writingComment = true
  state.draftComment = ''
  state.focusedName = 'cardComment'
  state.error = ''
  requestRerender()
}

export const cancelWriteComment = (
  context: Readonly<TrelloViewActionContext>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  state.writingComment = false
  state.draftComment = ''
  state.savingComment = false
  state.error = ''
  requestRerender()
}

export const submitComment = async (
  context: Readonly<TrelloViewActionContext>,
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials || !state.selectedCardDetail || state.savingComment) {
    return
  }
  const text = state.draftComment.trim()
  if (!text) {
    state.error = 'Comment is required.'
    requestRerender()
    return
  }
  state.savingComment = true
  state.error = ''
  requestRerender()
  try {
    const comment = await client.addCardComment(
      state.selectedCardDetail.card,
      text,
      state.credentials,
    )
    const card = updateCardCommentCount(state.selectedCardDetail.card)
    state.selectedCardDetail = {
      ...state.selectedCardDetail,
      card,
      comments: [...state.selectedCardDetail.comments, comment],
    }
    updateBoardDetailCard(state, card)
    state.writingComment = false
    state.draftComment = ''
  } catch (error) {
    state.error = getErrorMessage(error)
  }
  state.savingComment = false
  requestRerender()
}
