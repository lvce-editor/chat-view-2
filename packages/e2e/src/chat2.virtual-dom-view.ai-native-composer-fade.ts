import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-composer-fade'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.aiNativeTheme': 'claude',
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')

  const chat = Locator('.ChatAiNativeLayoutTheme-claude')
  const composer = Locator('textarea[name="composer"]')
  const changes = Locator('.ChatChanges')
  await expect(chat).toBeVisible()
  await expect(composer).toBeVisible()
  await composer.type('Make a scoped change')
  await Command.executeExtensionCommand('chat2.submit')

  const userMessage = Locator('.ChatMessageUser')
  await expect(userMessage).toBeVisible()
  await expect(changes).toContainText('Edited 5 files')
  await expect(composer).toBeVisible()
  await composer.type('Keep the composer interactive beneath the message fade')
  await expect(composer).toHaveValue(
    'Keep the composer interactive beneath the message fade',
  )
}
