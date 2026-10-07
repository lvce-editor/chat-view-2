import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.session-url'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const firstTask = Locator('.ChatTaskButton').first()
  await expect(firstTask).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await firstTask.click()
  await expect(Locator('.ChatDetailView')).toBeVisible()

  let href = (await Command.execute('Layout.getHref')) as string
  if (!href.includes('#chat-mock-task-1')) {
    throw new Error(`Expected chat URL fragment, received ${href}`)
  }

  await Command.execute('Window.reload')
  await expect(Locator('.ChatDetailView')).toBeVisible()
  href = (await Command.execute('Layout.getHref')) as string
  if (!href.includes('#chat-mock-task-1')) {
    throw new Error(`Expected restored chat URL fragment, received ${href}`)
  }

  // eslint-disable-next-line e2e/no-direct-click
  await Locator('.ChatNewTaskButton').click()
  await expect(Locator('.ChatDetailView .ChatEmptyTitle')).toBeVisible()
  href = (await Command.execute('Layout.getHref')) as string
  if (href.includes('#chat-')) {
    throw new Error(`Expected new chat to clear URL fragment, received ${href}`)
  }
}
