import type { TrelloViewState } from './TrelloViewState.ts'

export const contextKeyBoardDetailFocus = 'trello.boardDetailFocus'
export const contextKeyBoardsFocus = 'trello.boardsFocus'
export const contextKeyCardDescriptionFocus = 'trello.cardDescriptionFocus'
export const contextKeyCardDetailFocus = 'trello.cardDetailFocus'
export const contextKeyCardLabelPickerFocus = 'trello.cardLabelPickerFocus'
export const contextKeyNewCardInputFocus = 'trello.newCardInputFocus'
export const contextKeyNewListInputFocus = 'trello.newListInputFocus'

export const updateContext = (state: Readonly<TrelloViewState>): void => {
  const context: Record<string, boolean> = {}
  if (state.credentials && state.boardDetail) {
    context[contextKeyBoardDetailFocus] = true
  }
  if (state.credentials && !state.boardDetail) {
    context[contextKeyBoardsFocus] = true
  }
  if (state.selectedCardDetail) {
    context[contextKeyCardDetailFocus] = true
  }
  if (state.cardLabelPickerOpen && state.focusedName === 'cardLabelSearch') {
    context[contextKeyCardLabelPickerFocus] = true
  }
  if (
    state.focusedName === 'cardDescription' &&
    state.selectedCardDetail &&
    state.editingCardDescription
  ) {
    context[contextKeyCardDescriptionFocus] = true
  }
  if (
    state.addingCardListId &&
    state.focusedName === `newCardTitle:${state.addingCardListId}`
  ) {
    context[contextKeyNewCardInputFocus] = true
  }
  if (state.addingList && state.focusedName === 'newListTitle') {
    context[contextKeyNewListInputFocus] = true
  }
  const mutableState = state as TrelloViewState
  mutableState.context = context
}
