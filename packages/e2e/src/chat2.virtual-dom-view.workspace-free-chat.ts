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
  const submit = Locator('button[name="submit"]')

  await composer.type('whats json')
  // Typing dispatches input asynchronously; wait for the view's draft update.
  await expect(submit).toHaveAttribute('disabled', null)
  await Command.executeExtensionCommand('chat2.submit')
  await expect(userMessages).toHaveCount(1)
  await expect(assistantMessages).toHaveCount(1)

  await composer.type('Can I ask another question?')
  await expect(submit).toHaveAttribute('disabled', null)
  await Command.executeExtensionCommand('chat2.submit')
  await expect(userMessages).toHaveCount(2)
  await expect(assistantMessages).toHaveCount(2)
  await expect(detail).toBeVisible()
}
