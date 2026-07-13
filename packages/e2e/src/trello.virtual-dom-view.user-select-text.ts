import type { Test } from '@lvce-editor/test-with-playwright'
import {
  createBoards,
  createMockData,
  useMockDataAndShowTrello,
} from './_trello.virtual-dom-view.shared.ts'

export const name = 'trello.virtual-dom-view.user-select-text'

export const test: Test = async ({ Command, expect, Locator }) => {
  const boards = createBoards(1)
  await useMockDataAndShowTrello(Command, createMockData(boards))

  const welcomeText = Locator('.TrelloWelcomeText')
  await expect(welcomeText).toBeVisible()
  await expect(welcomeText).toHaveCSS('user-select', 'text')
}
