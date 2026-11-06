import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.message-font-family'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.aiNativeTheme': 'claude',
    'chat2.assistantMessageFontFamily': '"Courier New", monospace',
    'chat2.useMockBackend': true,
    'chat2.userMessageFontFamily': 'Arial, sans-serif',
  })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await composer.type('Show this JSON:\n```json\n{"jsonrpc":"2.0"}\n```')
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="submit"]').click()

  const userMessage = Locator('.ChatMessageUser .ChatMessageText')
  const assistantMessage = Locator('.ChatMessageAssistant .ChatMessageText')
  const code = Locator('.ChatMessageUser .ChatCodeContent')
  const aiNativeLayout = Locator('.ChatAiNativeLayout')
  await expect(userMessage).toHaveCSS('font-family', 'Arial, sans-serif')
  await expect(assistantMessage).toHaveCSS(
    'font-family',
    '"Courier New", monospace',
  )
  await expect(code).toHaveCSS('font-family', 'monospace')

  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(aiNativeLayout).toBeVisible()
  await expect(userMessage).toHaveCSS('font-family', 'Arial, sans-serif')
  await expect(assistantMessage).toHaveCSS(
    'font-family',
    '"Courier New", monospace',
  )
  await expect(code).toHaveCSS('font-family', 'monospace')
}
