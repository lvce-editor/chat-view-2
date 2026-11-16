import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.ai-native-activity-bar-toggle'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  const workbench = Locator('.Workbench.AiNativeLayout')
  const activityBar = Locator('.ActivityBarLayout')
  const ideTabs = Locator('.ActivityBarLayout [role="tab"]')
  const settings = Locator('.ActivityBarLayout [title="Settings"]')
  const chat = Locator('.ChatAiNativeLayout')
  const explorer = Locator('.ActivityBarLayout [title="Explorer"]')
  await expect(workbench).toBeVisible()
  await expect(ideTabs).toHaveCount(0)
  for (const side of ['Left', 'Right']) {
    await Command.execute(`Layout.moveSideBar${side}`)
    for (let index = 0; index < 2; index++) {
      await Command.execute('Layout.toggleActivityBar')
      await expect(activityBar).toBeHidden()
      await Command.execute('Layout.toggleActivityBar')
      await expect(activityBar).toBeVisible()
      await expect(settings).toBeVisible()
      await expect(ideTabs).toHaveCount(0)
      await expect(workbench).toBeVisible()
      await expect(chat).toBeVisible()
    }
  }
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(workbench).toHaveCount(0)
  await expect(explorer).toBeVisible()
}
