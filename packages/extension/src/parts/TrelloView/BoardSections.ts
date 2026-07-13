import type { RecentBoardView } from '../RecentBoardStorage/RecentBoardStorage.ts'
import type { TrelloBoard } from '../TrelloTypes/TrelloTypes.ts'
import type { TrelloViewState } from './state/TrelloViewState.ts'

export interface WorkspaceSection {
  readonly boards: readonly TrelloBoard[]
  readonly name: string
}

export const parseDate = (value: string | undefined): number => {
  if (!value) {
    return 0
  }
  const time = Date.parse(value)
  if (Number.isNaN(time)) {
    return 0
  }
  return time
}

export const getLocalViewedAt = (
  recentBoardViews: readonly RecentBoardView[],
  boardId: string,
): number => {
  const recentBoardView = recentBoardViews.find((item) => {
    return item.boardId === boardId
  })
  return parseDate(recentBoardView?.viewedAt)
}

export const getBoardViewedAt = (
  state: Readonly<TrelloViewState>,
  board: TrelloBoard,
): number => {
  return Math.max(
    parseDate(board.dateLastView),
    getLocalViewedAt(state.recentBoardViews, board.id),
  )
}

export const sortBoardsByViewedAt = (
  state: Readonly<TrelloViewState>,
  boards: readonly TrelloBoard[],
): readonly TrelloBoard[] => {
  const originalIndexes = new Map(
    state.boards.map((board, index) => [board.id, index]),
  )
  return boards.toSorted((a, b) => {
    const viewedAtDiff = getBoardViewedAt(state, b) - getBoardViewedAt(state, a)
    if (viewedAtDiff !== 0) {
      return viewedAtDiff
    }
    return (originalIndexes.get(a.id) ?? 0) - (originalIndexes.get(b.id) ?? 0)
  })
}

export const getRecentlyViewedBoards = (
  state: Readonly<TrelloViewState>,
): readonly TrelloBoard[] => {
  return sortBoardsByViewedAt(state, state.boards)
    .filter((board) => getBoardViewedAt(state, board) > 0)
    .slice(0, 4)
}

export const getWorkspaceName = (board: TrelloBoard): string => {
  return (
    board.organization?.displayName ||
    board.organization?.name ||
    'Personal boards'
  )
}

export const getWorkspaceSections = (
  state: Readonly<TrelloViewState>,
): readonly WorkspaceSection[] => {
  const sections = new Map<string, TrelloBoard[]>()
  for (const board of state.boards) {
    const name = getWorkspaceName(board)
    const boards = sections.get(name) || []
    boards.push(board)
    sections.set(name, boards)
  }
  return Array.from(
    sections,
    (entry: readonly [string, readonly TrelloBoard[]]): WorkspaceSection => {
      const [name, boards] = entry
      return {
        boards: sortBoardsByViewedAt(state, boards),
        name,
      }
    },
  )
}
