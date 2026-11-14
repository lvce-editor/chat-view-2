import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.session-keyboard'

export const test: Test = async ({
  Command,
  expect,
  KeyBoard,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const list = Locator('.ChatTaskList')
  const tasks = Locator('.ChatTaskButton')
  const nonTabbableTasks = Locator('.ChatTaskButton[tabindex="-1"]')
  const archiveButtons = Locator('.ChatTaskArchiveButton')
  await expect(tasks).toHaveCount(20)
  await expect(list).toHaveAttribute('tabindex', '0')
  await expect(nonTabbableTasks).toHaveCount(20)

  await list.type('')
  await expect(list).toBeFocused()
  await KeyBoard.press('ArrowDown')
  await expect(list).toHaveAttribute(
    'aria-activedescendant',
    'chat-task-mock-task-2',
  )
  await expect(archiveButtons).toHaveCount(20)
  const focusedArchiveButton = Locator('.ChatTaskArchiveButton[tabindex="0"]')
  await expect(focusedArchiveButton).toHaveCount(1)
  await KeyBoard.press('Tab')
  await expect(focusedArchiveButton).toBeFocused()
  await KeyBoard.press('Shift+Tab')
  await expect(list).toBeFocused()
  await KeyBoard.press('ArrowUp')
  await expect(list).toHaveAttribute(
    'aria-activedescendant',
    'chat-task-mock-task-1',
  )
  await KeyBoard.press('Tab')
  const firstArchiveButton = Locator('.ChatTaskArchiveButton[tabindex="0"]')
  await expect(firstArchiveButton).toBeFocused()
  await KeyBoard.press('Tab')
  const composer = Locator('textarea[name="composer"]')
  await expect(composer).toBeFocused()
}
