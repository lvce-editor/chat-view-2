import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoards,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.refresh-boards'
export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const firstBoards = createBoards(1)
  const refreshedBoards = [
    {
      id: 'board-2',
      name: 'Board 2',
    },
  ]
  await useMockDataAndShowTrello(Command, {
    boards: refreshedBoards,
    listBoardsResponses: [firstBoards, refreshedBoards],
  })
  await connectWithCredentials({ expect, Locator })

  const firstBoard = Locator('button[name="board:board-1"]')
  await expect(firstBoard).toBeVisible()

  const refresh = Locator('button[title="Refresh Boards"]')
  await expect(refresh).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await refresh.click()

  const refreshedBoard = Locator('button[name="board:board-2"]')
  await expect(refreshedBoard).toBeVisible()
  await expect(firstBoard).not.toBeVisible()
}
