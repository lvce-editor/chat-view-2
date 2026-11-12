import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.board-layout'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.execute('SideBar.show', 'chat2.views.board', true)
  const board = Locator('.BoardView')
  const providerGrid = Locator('.BoardProviderGrid')
  const setupTitle = Locator('.BoardSetupTitle')
  const trelloProvider = Locator('button[name="board-provider:trello"]')
  const providerTitle = Locator('.BoardProviderTitle')
  const allProviders = Locator('button[name="board-providers"]')
  const boardId = Locator('input[name="board-id"]')
  await expect(board).toBeVisible()
  await expect(setupTitle).toHaveText('Connect a board')
  await expect(providerGrid).toHaveCSS('display', 'grid')
  await expect(trelloProvider).toHaveText('Connect Trello')
  await expect(boardId).toHaveCount(0)
  await expect(board).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(board).toHaveCSS('color', 'rgb(32, 33, 36)')
  // eslint-disable-next-line e2e/no-direct-click
  await trelloProvider.click()
  await expect(providerTitle).toHaveText('Connect a Trello board')
  await expect(boardId).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await allProviders.click()
  await expect(providerGrid).toBeVisible()
  await expect(boardId).toHaveCount(0)
  // eslint-disable-next-line e2e/no-direct-click
  await trelloProvider.click()
  await expect(boardId).toBeVisible()
}
