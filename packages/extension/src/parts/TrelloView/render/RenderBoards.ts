import {
  VirtualDomElements,
  type VirtualDomNode,
} from '@lvce-editor/virtual-dom-worker'
import type {
  TrelloBoard,
  TrelloSearchResult,
} from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloViewState } from '../state/TrelloViewState.ts'
import * as Dom from '../../VirtualDom/VirtualDom.ts'
import {
  getRecentlyViewedBoards,
  getWorkspaceSections,
  type WorkspaceSection,
} from '../BoardSections.ts'
import {
  renderError,
  renderListTitle,
  renderTitle,
  renderToolbar,
} from './RenderShared.ts'

const renderSearchForm = (state: Readonly<TrelloViewState>): Dom.TreeNode => {
  return Dom.form('search', 'TrelloSearchForm', [
    Dom.input('search', state.draftSearchQuery, 'Search Trello'),
  ])
}

const renderBoardButton = (board: TrelloBoard): Dom.TreeNode => {
  return Dom.button(`board:${board.id}`, board.name, 'TrelloBoardButton')
}

const renderBoardGrid = (boards: readonly TrelloBoard[]): Dom.TreeNode => {
  return Dom.div('TrelloBoardGrid', boards.map(renderBoardButton))
}

const renderRecentlyViewed = (
  boards: readonly TrelloBoard[],
): readonly Dom.TreeNode[] => {
  if (boards.length === 0) {
    return []
  }
  return [
    Dom.div('TrelloSection', [
      renderListTitle('Recently viewed'),
      renderBoardGrid(boards),
    ]),
  ]
}

const renderWorkspaceSection = (
  section: Readonly<WorkspaceSection>,
): Dom.TreeNode => {
  return Dom.div('TrelloWorkspace', [
    renderListTitle(section.name),
    renderBoardGrid(section.boards),
  ])
}

const renderSearchResult = (
  result: Readonly<TrelloSearchResult>,
): Dom.TreeNode => {
  if (result.type === 'board') {
    return Dom.button(
      `board:${result.id}`,
      `Board: ${result.name}`,
      'TrelloSearchResult',
    )
  }
  return Dom.div('TrelloSearchResult', [Dom.textNode(`Card: ${result.name}`)])
}

const renderSearchContent = (
  state: Readonly<TrelloViewState>,
): readonly Dom.TreeNode[] => {
  if (state.loading) {
    return [Dom.textNode('Searching...')]
  }
  if (state.searchResults.length === 0) {
    return [
      renderListTitle(`Search results for "${state.activeSearchQuery}"`),
      Dom.textNode('No search results'),
    ]
  }
  return [
    Dom.div('TrelloSearchSection', [
      renderListTitle(`Search results for "${state.activeSearchQuery}"`),
      Dom.div(
        'TrelloSearchResults',
        state.searchResults.map(renderSearchResult),
      ),
    ]),
  ]
}

const renderBoardContent = (
  state: Readonly<TrelloViewState>,
): readonly Dom.TreeNode[] => {
  if (state.activeSearchQuery) {
    return renderSearchContent(state)
  }
  if (state.loading) {
    return [Dom.textNode('Loading boards...')]
  }
  if (state.boards.length === 0) {
    return [Dom.textNode('No boards found')]
  }
  const recentBoards = getRecentlyViewedBoards(state)
  const workspaceSections = getWorkspaceSections(state)
  return [
    ...renderRecentlyViewed(recentBoards),
    Dom.div('TrelloWorkspaces', [
      renderListTitle('Your workspaces'),
      ...workspaceSections.map(renderWorkspaceSection),
    ]),
  ]
}

export const renderBoards = (
  state: Readonly<TrelloViewState>,
): readonly VirtualDomNode[] => {
  const children = [
    ...(state.searchEnabled ? [renderToolbar([renderSearchForm(state)])] : []),
    renderTitle('Boards'),
    ...renderBoardContent(state),
    ...renderError(state.error),
  ]
  return Dom.flatten(
    Dom.node(
      VirtualDomElements.Div,
      {
        className: 'TrelloView TrelloBoards',
        name: 'boards',
        onContextMenu: 'handleContextMenu',
      },
      children,
    ),
  )
}
