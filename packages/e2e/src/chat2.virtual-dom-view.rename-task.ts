import type { Test } from '@lvce-editor/test-with-playwright'
import { openChatTask, runChatViewCommand } from './_ChatCommands.ts'

export const name = 'chat2.virtual-dom-view.rename-task'

export const test: Test = async ({
  Command,
  ContextMenu,
  expect,
  KeyBoard,
  Locator,
  Main,
  QuickPick,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.aiNativeTheme': 'default',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')

  const firstTask = Locator('.ChatTaskButton').first()
  await openChatTask(Command, firstTask)
  const title = Locator('.ChatDetailTitle')
  await expect(title).toContainText('Add worker memory usage')
  const titleMenuButton = Locator('button[name="title-menu"]')
  await expect(titleMenuButton).toBeVisible()
  const renameMenuItem = Locator('.MenuItem')
  await runChatViewCommand(
    Command,
    'handleViewCommand',
    'handleTitleMenuClick',
    0,
    0,
  )
  await expect(renameMenuItem).toContainText('Rename')
  await ContextMenu.selectItem('Rename')
  const input = Locator('input[name="QuickPickInput"]')
  await expect(input).toHaveValue('Add worker memory usage')
  await QuickPick.setValue('Memory usage notes')
  await expect(input).toHaveValue('Memory usage notes')
  await KeyBoard.press('Enter')
  await expect(title).toHaveText('Memory usage notes')
  await expect(firstTask).toHaveText('Memory usage notes')

  const secondTask = Locator('.ChatTaskButton').nth(1)
  await openChatTask(Command, secondTask)
  await expect(title).toContainText('Fix quickpick beforeinput crash')
  await openChatTask(Command, firstTask)
  await expect(title).toHaveText('Memory usage notes')
}
