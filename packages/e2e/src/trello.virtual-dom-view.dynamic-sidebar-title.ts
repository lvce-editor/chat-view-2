import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoards,
  createMockData,
  openBoard,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.dynamic-sidebar-title'
export const skip = 1

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  await useMockDataAndShowTrello(Command, createMockData(boards))
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const sidebarTitle = Locator('.SideBarTitleAreaTitle')
  const boardTitle = Locator('.TrelloTitle')
  await expect(sidebarTitle).toHaveText('Trello: Roadmap')
  await expect(boardTitle).toHaveCount(0)
}
