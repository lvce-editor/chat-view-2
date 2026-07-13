import type { TrelloLabel } from '../../TrelloTypes/TrelloTypes.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { updateBoardDetailCard } from './UpdateBoardDetailCard.ts'

const hasLabel = (
  labels: readonly TrelloLabel[] | undefined,
  labelId: string,
): boolean => {
  return Boolean(
    labels?.some((label) => {
      return label.id === labelId
    }),
  )
}

const mergeLabels = (
  currentLabels: readonly TrelloLabel[] | undefined,
  updatedLabels: readonly TrelloLabel[] | undefined,
  addedLabel: TrelloLabel,
): readonly TrelloLabel[] => {
  if (updatedLabels) {
    return updatedLabels
  }
  if (hasLabel(currentLabels, addedLabel.id)) {
    return currentLabels || []
  }
  return [...(currentLabels || []), addedLabel]
}

export const openCardLabelPicker = async (
  context: TrelloViewActionContext,
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials || !state.boardDetail || !state.selectedCardDetail) {
    return
  }
  state.cardLabelPickerOpen = true
  state.focusedName = 'cardLabelSearch'
  state.error = ''
  if (state.boardLabelsLoaded || state.boardLabelsLoading) {
    requestRerender()
    return
  }
  state.boardLabelsLoading = true
  requestRerender()
  try {
    state.boardLabels = await client.listBoardLabels(
      state.boardDetail.board,
      state.credentials,
    )
    state.boardLabelsLoaded = true
  } catch (error) {
    state.error = getErrorMessage(error)
  } finally {
    state.boardLabelsLoading = false
  }
  requestRerender()
}

export const closeCardLabelPicker = (
  context: Readonly<TrelloViewActionContext>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  state.cardLabelPickerOpen = false
  state.draftLabelSearchQuery = ''
  if (state.focusedName === 'cardLabelSearch') {
    state.focusedName = ''
  }
  requestRerender()
}

export const addCardLabel = async (
  context: TrelloViewActionContext,
  labelId: string,
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (
    !state.credentials ||
    !state.selectedCardDetail ||
    state.addingCardLabelId
  ) {
    return
  }
  const label = state.boardLabels.find((item) => {
    return item.id === labelId
  })
  if (!label) {
    return
  }
  const { card } = state.selectedCardDetail
  if (hasLabel(card.labels, label.id)) {
    requestRerender()
    return
  }
  state.addingCardLabelId = label.id
  state.error = ''
  requestRerender()
  try {
    const updatedCard = await client.addCardLabel(
      card,
      label,
      state.credentials,
    )
    const labels = mergeLabels(card.labels, updatedCard.labels, label)
    const mergedCard = {
      ...card,
      ...updatedCard,
      labels,
    }
    state.selectedCardDetail = {
      ...state.selectedCardDetail,
      card: mergedCard,
    }
    updateBoardDetailCard(state, mergedCard)
    state.cardLabelPickerOpen = true
  } catch (error) {
    state.error = getErrorMessage(error)
  } finally {
    state.addingCardLabelId = ''
  }
  requestRerender()
}
