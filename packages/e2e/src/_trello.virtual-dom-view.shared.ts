import type { TestApi } from '@lvce-editor/test-with-playwright'

type Command = TestApi['Command']
type Expect = TestApi['expect']
type Locator = TestApi['Locator']

export interface TrelloBoard {
  readonly id: string
  readonly name: string
}

export interface TrelloCard {
  readonly id: string
  readonly name: string
}

export interface TrelloList {
  readonly cards: readonly TrelloCard[]
  readonly id: string
  readonly name: string
}

export interface TrelloBoardDetail {
  readonly board: TrelloBoard
  readonly lists: readonly TrelloList[]
}

export interface MockTrelloData {
  readonly boardDetailErrors?: Readonly<Record<string, string>>
  readonly boardDetails?: Readonly<Record<string, TrelloBoardDetail>>
  readonly boards?: readonly TrelloBoard[]
  readonly error?: string
  readonly listBoardsError?: string
  readonly listBoardsResponses?: readonly (readonly TrelloBoard[])[]
}

export const createCards = (count: number): readonly TrelloCard[] => {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1
    return {
      id: `card-${number}`,
      name: `Card ${number}`,
    }
  })
}

export const createList = (
  id: string,
  name: string,
  cards: readonly TrelloCard[],
): TrelloList => {
  return {
    cards,
    id,
    name,
  }
}

export const createBoardDetail = (
  board: TrelloBoard,
  lists: readonly TrelloList[],
): TrelloBoardDetail => {
  return {
    board,
    lists,
  }
}

export const createMockData = (
  boards: readonly TrelloBoard[],
  boardDetails: Readonly<
    Record<string, TrelloBoardDetail>
  > = Object.fromEntries(
    boards.map((board) => [
      board.id,
      createBoardDetail(board, [createList('list-1', 'Todo', createCards(1))]),
    ]),
  ),
): MockTrelloData => {
  return {
    boardDetails,
    boards,
  }
}

export const createBoards = (count: number): readonly TrelloBoard[] => {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1
    return {
      id: `board-${number}`,
      name: number === 1 ? 'Roadmap' : `Board ${number}`,
    }
  })
}

export const useMockDataAndShowTrello = async (
  Command: Command,
  mockData: Readonly<MockTrelloData>,
): Promise<void> => {
  await Command.executeExtensionCommand('trello.test.useMockData', mockData)
  await Command.executeExtensionCommand('trello.show')
}

export const connectWithCredentials = async ({
  expect,
  Locator,
}: Readonly<Pick<TestApi, 'expect' | 'Locator'>>): Promise<void> => {
  const apiKey = Locator('input[name="apiKey"]')
  const token = Locator('input[name="token"]')
  await expect(apiKey).toBeVisible()
  await expect(token).toBeVisible()
  await apiKey.type('abcdefghijklmnopqrstuvwxyz123456')
  await token.type(
    'abcdefghijklmnopqrstuvwxyz123456abcdefghijklmnopqrstuvwxyz123456',
  )
  const connect = Locator('button[name="connect"]')
  await expect(connect).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await connect.click()
}

export const openBoard = async (
  Locator: Locator,
  expect: Expect,
  boardId = 'board-1',
): Promise<void> => {
  const board = Locator(`button[name="board:${boardId}"]`)
  await expect(board).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await board.click()
}
