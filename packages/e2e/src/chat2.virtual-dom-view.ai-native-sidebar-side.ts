import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-sidebar-side'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')
  const chat = Locator('.ChatAiNativeLayout')
  const activityBar = Locator('.ActivityBar')
  const sessions = Locator('.ChatSessions')
  for (const side of ['Right', 'Left']) {
    await Command.execute(`Layout.moveSideBar${side}`)
    await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
    await expect(chat).toBeVisible()
    await expect(chat).toHaveCSS(
      'flex-direction',
      side === 'Right' ? 'row-reverse' : 'row',
    )
    await expect(sessions).toBeVisible()
    await expect(activityBar).toBeVisible()
    await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
    await expect(chat).toHaveCount(0)
    // A second entry must retain the same side after restoring the IDE.
    await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
    await expect(chat).toHaveCSS(
      'flex-direction',
      side === 'Right' ? 'row-reverse' : 'row',
    )
    await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  }
}
