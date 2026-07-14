import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.task-navigation'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const task = Locator('.ChatTaskButton').first()
  const detail = Locator('.ChatDetailView')
  const detailTitle = Locator('.ChatDetailTitle')
  const messages = Locator('.ChatMessage')
  const list = Locator('.ChatListView')
  const tasks = Locator('.ChatTaskButton')
  await expect(task).toContainText('Add worker memory usage')
  // eslint-disable-next-line e2e/no-direct-click
  await task.click()

  await expect(detail).toBeVisible()
  await expect(detailTitle).toContainText('Add worker memory usage')
  await expect(messages).toHaveCount(2)

  const back = Locator('button[name="back"]')
  // eslint-disable-next-line e2e/no-direct-click
  await back.click()
  await expect(list).toBeVisible()
  await expect(tasks).toHaveCount(20)
}
