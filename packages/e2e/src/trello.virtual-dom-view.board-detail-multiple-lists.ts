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

export const name = 'trello.virtual-dom-view.board-detail-multiple-lists'
// export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  const listsData = [
    createList('list-1', 'Todo', [{ id: 'card-1', name: 'Plan work' }]),
    createList('list-2', 'Doing', [{ id: 'card-2', name: 'Build work' }]),
    createList('list-3', 'Done', [{ id: 'card-3', name: 'Ship work' }]),
  ]
  await useMockDataAndShowTrello(
    Command,
    createMockData(boards, {
      'board-1': createBoardDetail(boards[0], listsData),
    }),
  )
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const lists = Locator('.TrelloList')
  const cards = Locator('.TrelloCard')
  const todo = Locator('input[name="listTitle:list-1"]')
  const doing = Locator('input[name="listTitle:list-2"]')
  const done = Locator('input[name="listTitle:list-3"]')
  const planWork = Locator('text=Plan work')
  const buildWork = Locator('text=Build work')
  const shipWork = Locator('text=Ship work')

  await expect(lists).toHaveCount(3)
  await expect(cards).toHaveCount(3)
  await expect(todo).toBeVisible()
  await expect(doing).toBeVisible()
  await expect(done).toBeVisible()
  await expect(planWork).toBeVisible()
  await expect(buildWork).toBeVisible()
  await expect(shipWork).toBeVisible()
}
