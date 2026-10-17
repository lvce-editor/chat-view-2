import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.rename-task'

export const test: Test = async ({
  Command,
  ContextMenu,
  expect,
  KeyBoard,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.aiNativeTheme': 'default',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')

  const firstTask = Locator('.ChatTaskButton').first()
  // eslint-disable-next-line e2e/no-direct-click
  await firstTask.click()
  const title = Locator('.ChatDetailTitle')
  await expect(title).toContainText('Add worker memory usage')
  const states = (await Command.execute('Viewlet.getAllStates')) as Record<
    string,
    { readonly uid: number; readonly viewId: string }
  >
  const chatView = Object.values(states).find(
    ({ viewId }) => viewId === 'chat2.views.chat',
  )
  if (!chatView) {
    throw new Error('Expected Chat 2 view state')
  }
  await Command.execute(
    'Viewlet.executeViewletCommand',
    chatView.uid,
    'handleContextMenu',
    'chat-title',
    10,
    20,
  )
  await ContextMenu.selectItem('Rename')
  const input = Locator('input[name="QuickPickInput"]')
  await expect(input).toHaveValue('Add worker memory usage')
  await KeyBoard.press('Control+A')
  await input.type('Memory usage notes')
  await KeyBoard.press('Enter')
  await expect(title).toHaveText('Memory usage notes')
  await expect(firstTask).toHaveText('Memory usage notes')

  const secondTask = Locator('.ChatTaskButton').nth(1)
  // eslint-disable-next-line e2e/no-direct-click
  await secondTask.click()
  await expect(title).toContainText('Fix quickpick beforeinput crash')
  // eslint-disable-next-line e2e/no-direct-click
  await firstTask.click()
  await expect(title).toHaveText('Memory usage notes')
}
