import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoards,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.error-list-boards'
export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  await useMockDataAndShowTrello(Command, {
    boards,
    listBoardsError: 'Cannot list boards',
  })
  await connectWithCredentials({ expect, Locator })

  const error = Locator('text=Cannot list boards')
  const board = Locator('button[name="board:board-1"]')

  await expect(error).toBeVisible()
  await expect(board).not.toBeVisible()
}
