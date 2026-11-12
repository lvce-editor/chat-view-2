import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.board-layout'

export const test: Test = async ({ Command, expect, Locator, QuickPick }) => {
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await QuickPick.open()
  await QuickPick.setValue('>open board layout')
  await QuickPick.selectItem('View: Open Board Layout')
  const board = Locator('.BoardView')
  await expect(board).toBeVisible()
  await expect(Locator('.Workbench.AiNativeLayout')).toBeVisible()
  await expect(Locator('.BoardSetupTitle')).toHaveText('Connect a Trello board')
  const boardId = Locator('input[name="board-id"]')
  await boardId.type('invalid')
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('.BoardPrimaryButton').click()
  await expect(Locator('.BoardError')).toContainText(
    'TRELLO_CREDENTIALS_REQUIRED',
  )
  await expect(Locator('.BoardError')).toContainText(
    'Enter your Trello API key',
  )
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="board-ide"]').click()
  await expect(Locator('.Workbench.AiNativeLayout')).toHaveCount(0)
  await expect(Locator('.Main')).toBeVisible()
  await Command.executeExtensionCommand('chat2.showBoardLayout')
  await expect(board).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="board-chat"]').click()
  await expect(Locator('.ChatAiNativeLayout')).toBeVisible()
}
