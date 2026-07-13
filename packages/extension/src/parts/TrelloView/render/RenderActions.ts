import type { TrelloViewState } from '../state/TrelloViewState.ts'

export interface ViewAction {
  readonly command: string
  readonly icon: string
  readonly title: string
}

const actionBackToBoards: ViewAction = {
  command: 'trello.backToBoards',
  icon: 'ArrowLeft',
  title: 'Back to Boards',
}

const actionRefreshBoards: ViewAction = {
  command: 'trello.refreshBoards',
  icon: 'Refresh',
  title: 'Refresh Boards',
}

const actionSignOut: ViewAction = {
  command: 'trello.logout',
  icon: 'Account',
  title: 'Sign Out',
}

export const renderActions = (
  state: Readonly<TrelloViewState>,
): readonly ViewAction[] => {
  if (!state.credentials) {
    return []
  }
  if (state.boardDetail) {
    return [actionBackToBoards, actionRefreshBoards, actionSignOut]
  }
  return [actionRefreshBoards, actionSignOut]
}
