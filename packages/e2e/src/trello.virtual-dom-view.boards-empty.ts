import type { Test } from '@lvce-editor/test-with-playwright'
import {
  connectWithCredentials,
  createMockData,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.boards-empty'
// export const skip = true

export const test: Test = async ({ Command, expect, Locator }) => {
  await useMockDataAndShowTrello(Command, createMockData([]))
  await connectWithCredentials({ expect, Locator })

  const noBoards = Locator('text=No boards found')
  const boardButtons = Locator('.TrelloBoardButton')

  await expect(noBoards).toBeVisible()
  await expect(boardButtons).toHaveCount(0)
}
