import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.new-chat'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  const detailView = Locator('.ChatDetailView')
  const listView = Locator('.ChatListView')
  await composer.type('Start the first chat')
  await Command.executeExtensionCommand('chat2.submit')
  await expect(detailView).toBeVisible()

  await composer.type('Discard this draft')
  await Command.executeExtensionCommand('chat2.newChat')

  await expect(listView).toBeVisible()
  await expect(detailView).toHaveCount(0)
  await expect(composer).toHaveValue('')
}
