import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoards,
  createMockData,
  openBoard,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.error-board-detail'
export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  await useMockDataAndShowTrello(Command, {
    ...createMockData(boards),
    boardDetailErrors: {
      'board-1': 'Cannot load board',
    },
  })
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const error = Locator('text=Cannot load board')
  const board = Locator('button[name="board:board-1"]')
  const cards = Locator('.TrelloCard')

  await expect(error).toBeVisible()
  await expect(board).toBeVisible()
  await expect(cards).toHaveCount(0)
}
