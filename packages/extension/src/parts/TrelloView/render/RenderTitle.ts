import type { TrelloViewState } from '../state/TrelloViewState.ts'

export const renderTitle = (state: Readonly<TrelloViewState>): string => {
  if (state.boardDetail) {
    return `Trello: ${state.boardDetail.board.name}`
  }
  return 'Trello'
}
