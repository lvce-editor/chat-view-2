import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoards,
  createMockData,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.boards-many'
// export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(100)
  await useMockDataAndShowTrello(Command, createMockData(boards))
  await connectWithCredentials({ expect, Locator })

  const boardButtons = Locator('.TrelloBoardButton')
  const roadmap = Locator('button[name="board:board-1"]')
  const lastBoard = Locator('button[name="board:board-100"]')

  await expect(boardButtons).toHaveCount(100)
  await expect(roadmap).toHaveText('Roadmap')
  await expect(lastBoard).toHaveText('Board 100')
}
