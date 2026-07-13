import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { updateBoardDetailCard } from './UpdateBoardDetailCard.ts'

export const saveCardDetail = async (
  context: TrelloViewActionContext,
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (
    !state.credentials ||
    !state.selectedCardDetail ||
    state.savingCardDetail
  ) {
    return
  }
  const { card: savedCard } = state.selectedCardDetail
  if (state.draftCardDescription === (savedCard.desc || '')) {
    state.draftCardDescription = savedCard.desc || ''
    state.editingCardDescription = false
    state.error = ''
    requestRerender()
    return
  }
  state.error = ''
  state.savingCardDetail = true
  requestRerender()
  try {
    const updatedCard = await client.updateCard(
      savedCard,
      {
        desc: state.draftCardDescription,
        name: savedCard.name,
      },
      state.credentials,
    )
    const card = {
      ...savedCard,
      ...updatedCard,
    }
    state.selectedCardDetail = {
      ...state.selectedCardDetail,
      card,
    }
    state.draftCardTitle = card.name
    state.draftCardDescription = card.desc || ''
    state.editingCardDescription = false
    updateBoardDetailCard(state, card)
  } catch (error) {
    state.error = getErrorMessage(error)
  } finally {
    state.savingCardDetail = false
  }
  requestRerender()
}
