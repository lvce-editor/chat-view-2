import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.board-layout'

export const test: Test = async ({ Command, expect, Locator, QuickPick }) => {
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await QuickPick.open()
  await QuickPick.setValue('>open board layout')
  await QuickPick.selectItem('View: Open Board Layout')
  const board = Locator('.BoardView')
  const workbench = Locator('.Workbench.AiNativeLayout')
  const setupTitle = Locator('.BoardSetupTitle')
  const error = Locator('.BoardError')
  const main = Locator('.Main')
  const chat = Locator('.ChatAiNativeLayout')
  await expect(board).toBeVisible()
  await expect(workbench).toBeVisible()
  await expect(setupTitle).toHaveText('Connect a Trello board')
  const boardId = Locator('input[name="board-id"]')
  await boardId.type('invalid')
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('.BoardPrimaryButton').click()
  await expect(error).toContainText('TRELLO_CREDENTIALS_REQUIRED')
  await expect(error).toContainText('Enter your Trello API key')
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="board-ide"]').click()
  await expect(workbench).toHaveCount(0)
  await expect(main).toBeVisible()
  await Command.executeExtensionCommand('chat2.showBoardLayout')
  await expect(board).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="board-chat"]').click()
  await expect(chat).toBeVisible()
}
