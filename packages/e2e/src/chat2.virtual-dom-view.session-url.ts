import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.session-url'

export const test: Test = async ({
  Command,
  expect,
  KeyBoard,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await Command.executeExtensionCommand('chat2.newChat')

  const firstTask = Locator('.ChatTaskButton').first()
  const detailView = Locator('.ChatDetailView')
  const detailTitle = Locator('.ChatDetailTitle')
  const selectedTask = Locator('.ChatTaskSelected')
  const selectedTaskButton = Locator('.ChatTaskSelected .ChatTaskButton')
  const taskList = Locator('.ChatTaskList')
  await expect(detailView).toBeVisible()
  await expect(firstTask).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await firstTask.click()
  await expect(detailView).toBeVisible()
  await expect(detailTitle).toContainText('Add worker memory usage')
  await expect(selectedTask).toHaveCount(1)
  await expect(selectedTaskButton).toContainText('Add worker memory usage')

  await taskList.type('')
  await KeyBoard.press('ArrowDown')
  await expect(selectedTask).toHaveCount(1)
  await expect(selectedTaskButton).toContainText('Add worker memory usage')

  const secondTask = Locator('.ChatTaskButton').nth(1)
  await secondTask.hover()
  await expect(selectedTask).toHaveCount(1)
  await expect(selectedTaskButton).toContainText('Add worker memory usage')
  // eslint-disable-next-line e2e/no-direct-click
  await secondTask.click()
  await expect(selectedTask).toHaveCount(1)
  await expect(selectedTask).toHaveCSS('box-shadow', /inset/)
  await expect(selectedTaskButton).toContainText(
    'Fix quickpick beforeinput crash',
  )

  let href = (await Command.execute('Layout.getHref')) as string
  if (!href.includes('#mock-task-2')) {
    throw new Error(`Expected chat URL fragment, received ${href}`)
  }

  await Command.executeExtensionCommand('chat2.newChat')
  await expect(selectedTask).toHaveCount(0)
  href = (await Command.execute('Layout.getHref')) as string
  if (href.includes('#chat-')) {
    throw new Error(`Expected new chat to clear URL fragment, received ${href}`)
  }
}
