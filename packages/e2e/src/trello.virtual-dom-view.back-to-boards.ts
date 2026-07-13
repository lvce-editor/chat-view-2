import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoards,
  createMockData,
  openBoard,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.back-to-boards'
export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  await useMockDataAndShowTrello(Command, createMockData(boards))
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const back = Locator('button[title="Back to Boards"]')
  await expect(back).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await back.click()

  const board = Locator('button[name="board:board-1"]')
  const cards = Locator('.TrelloCard')

  await expect(board).toBeVisible()
  await expect(cards).toHaveCount(0)
}
