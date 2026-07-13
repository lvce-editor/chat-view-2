// @ts-nocheck
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

export const name = 'trello.virtual-dom-view.card-drag-drop'
export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  const todo = createList('list-1', 'Todo', [
    { id: 'card-1', name: 'Plan work' },
  ])
  const doing = createList('list-2', 'Doing', [
    { id: 'card-2', name: 'Build work' },
  ])
  const boardDetails = {
    'board-1': createBoardDetail(boards[0], [todo, doing]),
  }
  await useMockDataAndShowTrello(Command, createMockData(boards, boardDetails))
  await connectWithCredentials({ expect, Locator })
  await openBoard(Locator, expect)

  const planWork = Locator('button[name="card:card-1"]')
  const doingList = Locator('.TrelloList[name="list:list-2"]')
  const buildWork = doingList.locator('button[name="card:card-2"]')
  await expect(planWork).toBeVisible()
  await expect(doingList).toBeVisible()
  await expect(buildWork).toBeVisible()

  await planWork.dispatchEvent('dragstart', '{}')
  await buildWork.dispatchEvent('dragover', '{}')
  await expect(doingList).toHaveClass('TrelloList TrelloListDragTarget')
  await buildWork.dispatchEvent('drop', '{"value":"card-1"}')

  const cards = doingList.locator('button.TrelloCard')
  const movedCard = cards.nth(0)
  await expect(movedCard).toBeVisible()
  await expect(movedCard).toHaveText('Plan work')
}
