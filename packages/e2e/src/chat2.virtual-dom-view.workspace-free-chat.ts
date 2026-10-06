import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.workspace-free-chat'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  const userMessages = Locator('.ChatMessageUser')
  const assistantMessages = Locator('.ChatMessageAssistant')
  const detail = Locator('.ChatDetailView')

  await composer.type('whats json')
  await Command.executeExtensionCommand('chat2.submit')
  await expect(userMessages).toHaveCount(1)
  await expect(assistantMessages).toHaveCount(1)

  await composer.type('Can I ask another question?')
  await Command.executeExtensionCommand('chat2.submit')
  await expect(userMessages).toHaveCount(2)
  await expect(assistantMessages).toHaveCount(2)
  await expect(detail).toBeVisible()
}
