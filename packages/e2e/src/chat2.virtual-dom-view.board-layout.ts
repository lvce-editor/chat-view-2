import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.board-layout'

const boardPathSuffix = /board\/?$/

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  const initialUrl = new URL(
    (await Command.execute('Layout.getHref')) as string,
  )
  await Command.executeExtensionCommand('chat2.showBoardLayout')
  const boardUrl = new URL((await Command.execute('Layout.getHref')) as string)
  if (!boardUrl.pathname.endsWith('/board')) {
    throw new Error(`Expected board route, received ${boardUrl.href}`)
  }
  if (boardUrl.search !== initialUrl.search) {
    throw new Error(
      `Expected workspace query to remain intact, received ${boardUrl.href}`,
    )
  }
  const board = Locator('.BoardView')
  const providerGrid = Locator('.BoardProviderGrid')
  const setupTitle = Locator('.BoardSetupTitle')
  const trelloProvider = Locator('button[name="board-provider:trello"]')
  const providerTitle = Locator('.BoardProviderTitle')
  const allProviders = Locator('button[name="board-providers"]')
  const boardId = Locator('input[name="board-id"]')
  const authorize = Locator('button[name="board-authorize"]')
  const apiKey = Locator('input[name="board-api-key"]')
  const token = Locator('input[name="board-token"]')
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
  await expect(authorize).toBeVisible()
  await expect(boardId).toHaveCount(0)
  await expect(apiKey).toHaveCount(0)
  await expect(token).toHaveCount(0)
  // eslint-disable-next-line e2e/no-direct-click
  await allProviders.click()
  await expect(providerGrid).toBeVisible()
  await expect(boardId).toHaveCount(0)
  // eslint-disable-next-line e2e/no-direct-click
  await trelloProvider.click()
  await expect(authorize).toBeVisible()
  await expect(boardId).toHaveCount(0)
  await expect(apiKey).toHaveCount(0)
  await expect(token).toHaveCount(0)
  await Command.executeExtensionCommand('chat2.showAiNativeLayout')
  const chatUrl = new URL((await Command.execute('Layout.getHref')) as string)
  if (!chatUrl.pathname.endsWith('/chat')) {
    throw new Error(`Expected chat route, received ${chatUrl.href}`)
  }
  if (chatUrl.search !== initialUrl.search) {
    throw new Error(
      `Expected workspace query to remain intact, received ${chatUrl.href}`,
    )
  }
  await Command.executeExtensionCommand('chat2.showBoardLayout')
  await Command.executeExtensionCommand('chat2.showIdeLayout')
  const ideUrl = new URL((await Command.execute('Layout.getHref')) as string)
  const idePath = boardUrl.pathname.replace(boardPathSuffix, '') || '/'
  if (ideUrl.pathname !== idePath) {
    throw new Error(
      `Expected IDE route ${idePath}, received ${ideUrl.pathname}`,
    )
  }
  if (ideUrl.search !== initialUrl.search) {
    throw new Error(
      `Expected workspace query to remain intact, received ${ideUrl.href}`,
    )
  }
}
