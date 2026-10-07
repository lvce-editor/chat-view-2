import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.session-url'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.newChat')

  const firstTask = Locator('.ChatTaskButton').first()
  const detailView = Locator('.ChatDetailView')
  const detailTitle = Locator('.ChatDetailTitle')
  await expect(detailView).toHaveCount(0)
  await expect(firstTask).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await firstTask.click()
  await expect(detailView).toBeVisible()
  await expect(detailTitle).toContainText('Add worker memory usage')

  let href = (await Command.execute('Layout.getHref')) as string
  if (!href.includes('#chat-mock-task-1')) {
    throw new Error(`Expected chat URL fragment, received ${href}`)
  }

  await Command.executeExtensionCommand('chat2.newChat')
  href = (await Command.execute('Layout.getHref')) as string
  if (href.includes('#chat-')) {
    throw new Error(`Expected new chat to clear URL fragment, received ${href}`)
  }
}
