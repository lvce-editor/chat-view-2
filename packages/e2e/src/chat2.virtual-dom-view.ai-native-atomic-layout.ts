import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-atomic-layout'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  const workbench = Locator('.Workbench.AiNativeLayout')
  const contentArea = Locator('.ContentArea')
  const sessions = Locator('.ChatSessions')
  const main = Locator('.Main')
  for (const theme of ['default', 'claude']) {
    await Command.execute('Preferences.update', {
      'chat2.aiNativeTheme': theme,
    })
    await Command.executeExtensionCommand('chat2.show')
    for (const side of ['Left', 'Right']) {
      await Command.execute(`Layout.moveSideBar${side}`)
      for (let index = 0; index < 3; index++) {
        await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
        await expect(workbench).toHaveCount(1)
        const chat = Locator('.ChatAiNativeLayout')
        await expect(chat).toBeVisible()
        await expect(chat).toHaveCSS(
          'background-color',
          theme === 'claude' ? 'rgb(250, 249, 246)' : 'rgb(255, 255, 255)',
        )
        await expect(contentArea).toHaveCSS('animation-name', 'none')
        await expect(sessions).toBeVisible()
        await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
        await expect(workbench).toHaveCount(0)
        await expect(chat).toHaveCount(0)
        await expect(contentArea).toHaveCSS('animation-name', 'none')
        await expect(main).toBeVisible()

        await Locator('.ActivityBarLayout').dispatchEvent('wheel', {
          bubbles: true,
          deltaY: -100,
        } as unknown as string)
        await expect(workbench).toHaveCount(1)
        await expect(chat).toBeVisible()
        await expect(chat).toHaveCSS(
          'background-color',
          theme === 'claude' ? 'rgb(250, 249, 246)' : 'rgb(255, 255, 255)',
        )
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
}
