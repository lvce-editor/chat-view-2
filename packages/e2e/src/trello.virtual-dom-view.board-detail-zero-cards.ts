import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoardDetail,
  createBoards,
  createList,
  createMockData,
  openBoard,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.board-detail-zero-cards'
// export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  const lists = [createList('list-1', 'Todo', [])]
  await useMockDataAndShowTrello(
    Command,
    createMockData(boards, {
      'board-1': createBoardDetail(boards[0], lists),
    }),
  )
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const list = Locator('.TrelloList')
  const noCards = Locator('text=No cards')
  const cards = Locator('.TrelloCard')

  await expect(list).toHaveCount(1)
  await expect(noCards).toBeVisible()
  await expect(cards).toHaveCount(0)
}
