import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-sidebar-side'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.aiNativeTheme': 'default',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  const chat = Locator('.ChatAiNativeLayout')
  const activityBar = Locator('.ActivityBar')
  const activityBarLayout = Locator('.ActivityBarLayout')
  const sessions = Locator('.ChatSessions')
  let expectedSessionsWidth = 280
  for (const side of ['Right', 'Left']) {
    await Command.execute(`Layout.moveSideBar${side}`)
    await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
    await expect(chat).toBeVisible()
    await expect(chat).toHaveCSS(
      'flex-direction',
      side === 'Right' ? 'row-reverse' : 'row',
    )
    await expect(sessions).toBeVisible()
    await expect(activityBarLayout).toHaveCSS(
      'background-color',
      'rgb(245, 245, 245)',
    )
    await expect(sessions).toHaveCSS('background-color', 'rgb(250, 250, 250)')
    const sash = Locator('.ChatSessionsSash')
    await expect(sash).toHaveAttribute('role', 'separator')
    await sash.dispatchEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 400,
      pointerId: 1,
    } as unknown as string)
    await sash.dispatchEvent('pointermove', {
      bubbles: true,
      clientX: 450,
      pointerId: 1,
    } as unknown as string)
    expectedSessionsWidth += side === 'Right' ? -50 : 50
    await expect(sessions).toHaveCSS('width', `${expectedSessionsWidth}px`)
    await sash.dispatchEvent('pointerup', {
      bubbles: true,
      button: 0,
      clientX: 450,
      pointerId: 1,
    } as unknown as string)
    const task = Locator('.ChatTaskButton').first()
    // eslint-disable-next-line e2e/no-direct-click
    await task.click()
    const composer = Locator('textarea[name="composer"]')
    await composer.type('Long conversation '.repeat(100))
    await Command.executeExtensionCommand('chat2.submit')
    const messages = Locator('.ChatMessages')
    const messageContent = Locator('.ChatMessagesContent')
    const composerArea = Locator('.ChatMessages > .ChatComposerArea')
    await expect(messages).toHaveCSS('padding-right', '0px')
    await expect(messages).toHaveCSS('overflow-y', 'auto')
    await expect(composerArea).toHaveCount(1)
    await expect(composerArea).toHaveCSS('position', 'sticky')
    await expect(composerArea).toHaveCSS('bottom', '0px')
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
    await expect(activityBarLayout).toHaveCSS(
      'background-color',
      'rgb(245, 245, 245)',
    )
    await expect(sessions).toHaveCSS('background-color', 'rgb(250, 250, 250)')
    await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  }
}
