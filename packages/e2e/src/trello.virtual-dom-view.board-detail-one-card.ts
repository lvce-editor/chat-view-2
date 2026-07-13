import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoardDetail,
  createBoards,
  createCards,
  createList,
  createMockData,
  openBoard,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.board-detail-one-card'
// export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  const cardData = createCards(1)
  const lists = [createList('list-1', 'Todo', cardData)]
  await useMockDataAndShowTrello(
    Command,
    createMockData(boards, {
      'board-1': createBoardDetail(boards[0], lists),
    }),
  )
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const cards = Locator('.TrelloCard')
  const firstCard = Locator('text=Card 1')

  await expect(cards).toHaveCount(1)
  await expect(firstCard).toBeVisible()
}
