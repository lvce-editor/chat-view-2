import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-message-font-size'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await composer.type('What is the latest version?')
  await Command.executeExtensionCommand('chat2.submit')

  const userMessage = Locator('.ChatMessageUser')
  const assistantMessage = Locator('.ChatMessageAssistant')
  await expect(userMessage).toHaveCount(1)
  await expect(assistantMessage).toHaveCount(1)
  await expect(userMessage).toHaveCSS('font-size', '13px')
  await expect(assistantMessage).toHaveCSS('font-size', '13px')

  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(Locator('.ChatAiNativeLayout')).toBeVisible()
  await expect(userMessage).toHaveCSS('font-size', '15px')
  await expect(assistantMessage).toHaveCSS('font-size', '15px')
}
