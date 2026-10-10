import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-atomic-layout'

const expectAiNativeLayout = async (
  { expect, Locator }: Pick<TestApi, 'expect' | 'Locator'>,
  theme: string,
  side: string,
): Promise<void> => {
  const chat = Locator('.ChatAiNativeLayout')
  const contentArea = Locator('.ContentArea')
  const sessions = Locator('.ChatSessions')
  await expect(chat).toBeVisible()
  await expect(chat).toHaveCSS(
    'flex-direction',
    side === 'Right' ? 'row-reverse' : 'row',
  )
  await expect(chat).toHaveCSS(
    'background-color',
    theme === 'claude' ? 'rgb(250, 249, 246)' : 'rgb(255, 255, 255)',
  )
  await expect(contentArea).toHaveCSS('animation-name', 'none')
  await expect(sessions).toBeVisible()
}

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  const workbench = Locator('.Workbench.AiNativeLayout')
  const contentArea = Locator('.ContentArea')
  const main = Locator('.Main')
  const composer = Locator('textarea[name="composer"]')
  const titleBar = Locator('.Viewlet.TitleBar')
  const statusBar = Locator('.StatusBar')
  for (const theme of ['default', 'claude']) {
    await Command.execute('Preferences.update', {
      'chat2.aiNativeTheme': theme,
    })
    await Command.executeExtensionCommand('chat2.show')
    await Command.execute('Layout.showTitleBar')
    await Command.execute('Layout.showStatusBar')
    await expect(titleBar).toHaveCount(1)
    await expect(statusBar).toHaveCount(1)
    for (const side of ['Left', 'Right']) {
      await Command.execute(`Layout.moveSideBar${side}`)
      for (let index = 0; index < 3; index++) {
        await expect(titleBar).toHaveCount(1)
        await expect(statusBar).toHaveCount(1)
        await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
        await expect(workbench).toHaveCount(1)
        await expect(titleBar).toHaveCount(0)
        await expect(statusBar).toHaveCount(0)
        const chat = Locator('.ChatAiNativeLayout')
        await expectAiNativeLayout({ expect, Locator }, theme, side)
        if (side === 'Left' && index === 0) {
          await composer.type(`Preserve the ${theme} draft`)
        }
        await expect(composer).toHaveValue(`Preserve the ${theme} draft`)
        await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
        await expect(workbench).toHaveCount(0)
        await expect(chat).toHaveCount(0)
        await expect(titleBar).toHaveCount(1)
        await expect(statusBar).toHaveCount(1)
        await expect(contentArea).toHaveCSS('animation-name', 'none')
        await expect(main).toBeVisible()

        await Locator('.ActivityBarLayout').dispatchEvent('wheel', {
          bubbles: true,
          deltaY: -100,
        } as unknown as string)
        await expect(workbench).toHaveCount(1)
        await expectAiNativeLayout({ expect, Locator }, theme, side)
        await expect(composer).toHaveValue(`Preserve the ${theme} draft`)
        await Locator('.ActivityBarLayout').dispatchEvent('wheel', {
          bubbles: true,
          deltaY: 100,
        } as unknown as string)
        await expect(workbench).toHaveCount(0)
        await expect(chat).toHaveCount(0)
        await expect(main).toBeVisible()
      }
    }
    // Recreate the view so the next theme is read from preferences.
    await Command.execute('Layout.showSideBar', 'Explorer')
  }

  await Command.executeExtensionCommand('chat2.show')
  await Command.execute('Layout.showTitleBar')
  await Command.execute('Layout.showStatusBar')
  await expect(titleBar).toHaveCount(1)
  await expect(statusBar).toHaveCount(1)
  await composer.type('Start a conversation in AI-native layout')
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(workbench).toHaveCount(1)
  await expect(titleBar).toHaveCount(0)
  await expect(statusBar).toHaveCount(0)
  await expect(composer).toHaveValue('Start a conversation in AI-native layout')
  await Command.executeExtensionCommand('chat2.submit')
  const userMessage = Locator('.ChatMessageUser')
  await expect(userMessage).toContainText(
    'Start a conversation in AI-native layout',
  )

  const newChatButton = Locator('.ChatSessions .ChatNewTaskButton')
  const emptyTitle = Locator('.ChatDetailView .ChatEmptyTitle')
  await expect(newChatButton).toHaveText('New chat')
  // eslint-disable-next-line e2e/no-direct-click
  await newChatButton.click()
  await expect(emptyTitle).toBeVisible()
  await expect(composer).toHaveValue('')
  await expect(composer).toBeFocused()
  await composer.type('Type immediately in AI-native layout')
  await expect(composer).toHaveValue('Type immediately in AI-native layout')
  // Repeated clicks on an empty conversation still clear and focus the composer.
  // eslint-disable-next-line e2e/no-direct-click
  await newChatButton.click()
  await expect(emptyTitle).toBeVisible()
  await expect(composer).toHaveValue('')
  await expect(composer).toBeFocused()
  await composer.type('Another AI-native chat')
  await expect(composer).toHaveValue('Another AI-native chat')

  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(workbench).toHaveCount(0)
  await expect(titleBar).toHaveCount(1)
  await expect(statusBar).toHaveCount(1)
}
