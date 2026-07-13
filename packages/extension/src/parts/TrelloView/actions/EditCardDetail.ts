import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'

export const editCardTitle = (context: TrelloViewActionContext): void => {
  const state = context.state as TrelloViewState
  state.editingCardTitle = true
  context.requestRerender()
}

export const editCardDescription = (context: TrelloViewActionContext): void => {
  const state = context.state as TrelloViewState
  state.editingCardDescription = true
  state.focusedName = 'cardDescription'
  context.requestRerender()
}
