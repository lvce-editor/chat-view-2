import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createBoards,
  createCards,
  createList,
  createMockData,
  openBoard,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.board-detail'
// export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  const mockData = createMockData(boards, {
    'board-1': {
      board: boards[0],
      lists: [createList('list-1', 'Todo', createCards(1))],
    },
  })
  await useMockDataAndShowTrello(Command, mockData)
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const todo = Locator('input[name="listTitle:list-1"]')
  const card = Locator('text=Card 1')

  await expect(todo).toBeVisible()
  await expect(card).toBeVisible()
}
