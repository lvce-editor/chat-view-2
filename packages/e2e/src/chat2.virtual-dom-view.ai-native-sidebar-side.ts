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
    const task = Locator('.ChatTaskButton').first()
    // eslint-disable-next-line e2e/no-direct-click
    await task.click()
    const composer = Locator('textarea[name="composer"]')
    await composer.type('Long conversation '.repeat(100))
    await Command.executeExtensionCommand('chat2.submit')
    const messages = Locator('.ChatMessages')
    const messageContent = Locator('.ChatMessagesContent')
    await expect(messages).toHaveCSS('padding-right', '0px')
    await expect(messageContent).toHaveCSS('max-width', '960px')
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
