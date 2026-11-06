import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-theme'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.aiNativeTheme': 'claude',
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')

  const aiLayout = Locator('.ChatAiNativeLayoutTheme-claude')
  const messages = Locator('.ChatMessagesContent')
  await expect(aiLayout).toBeVisible()
  await expect(aiLayout).toHaveCSS('background-color', 'rgb(250, 249, 246)')
  await expect(messages).toHaveCSS(
    'font-family',
    'Georgia, "Times New Roman", serif',
  )
}
