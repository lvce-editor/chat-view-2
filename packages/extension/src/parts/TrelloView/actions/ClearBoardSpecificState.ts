import type { TrelloViewState } from '../state/TrelloViewState.ts'

export const clearBoardSpecificState = (
  state: Readonly<TrelloViewState>,
): void => {
  const mutableState = state as TrelloViewState
  mutableState.boardDetail = undefined
  mutableState.selectedCardDetail = undefined
  mutableState.cardAttachmentsLoading = false
  mutableState.cardCommentsLoading = false
  mutableState.cardDetailLoading = false
  mutableState.cardDetailLoadingCardId = ''
  mutableState.contextMenuCardId = ''
  mutableState.contextMenuListId = ''
  mutableState.addingCardListId = ''
  mutableState.addingCardLabelId = ''
  mutableState.addingList = false
  mutableState.boardLabels = []
  mutableState.boardLabelsLoaded = false
  mutableState.boardLabelsLoading = false
  mutableState.cardLabelPickerOpen = false
  mutableState.draftCardDescription = ''
  mutableState.draftCardTitle = ''
  mutableState.draftComment = ''
  mutableState.draftListTitles = {}
  mutableState.draftLabelSearchQuery = ''
  mutableState.draftNewCardTitle = ''
  mutableState.draftNewListTitle = ''
  mutableState.editingCardDescription = false
  mutableState.editingCardTitle = false
  mutableState.savingCardDetail = false
  mutableState.savingComment = false
  mutableState.savingNewCard = false
  mutableState.savingNewList = false
  mutableState.writingComment = false
}
