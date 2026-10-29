import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ai-native-wheel'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  const activityBar = Locator('.ActivityBarLayout')
  const aiLayout = Locator('.ChatAiNativeLayout')
  await expect(aiLayout).toHaveCount(0)
  await activityBar.dispatchEvent('wheel', {
    bubbles: true,
    deltaY: -100,
  } as unknown as string)
  await expect(aiLayout).toBeVisible()
  const workbench = Locator('.Workbench.AiNativeLayout')
  await expect(workbench).toHaveCount(1)
  await expect(aiLayout).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  const sessions = Locator('.ChatSessions')
  await expect(sessions).toBeVisible()
  const composer = Locator('textarea[name="composer"]')
  await composer.type('Keep this draft when returning to the IDE')
  // Conversation scrolling must not switch layouts.
  await Locator('.ChatMessages').dispatchEvent('wheel', {
    bubbles: true,
    deltaY: 100,
  } as unknown as string)
  await expect(aiLayout).toBeVisible()
  // A downward gesture returns to the IDE, and the next upward gesture
  // restores the full layout with the same chat instance.
  const contentArea = Locator('.ContentArea')
  await expect(contentArea).toHaveCSS('animation-name', 'none')
  await activityBar.dispatchEvent('wheel', {
    bubbles: true,
    deltaY: 100,
  } as unknown as string)
  await expect(workbench).toHaveCount(0)
  await expect(aiLayout).toHaveCount(0)

  await activityBar.dispatchEvent('wheel', {
    bubbles: true,
    deltaY: -100,
  } as unknown as string)
  await expect(workbench).toHaveCount(1)
  await expect(aiLayout).toBeVisible()
  await expect(composer).toHaveValue(
    'Keep this draft when returning to the IDE',
  )

  await activityBar.dispatchEvent('wheel', {
    bubbles: true,
    deltaY: 100,
  } as unknown as string)
  await expect(workbench).toHaveCount(0)
  await expect(aiLayout).toHaveCount(0)

  await activityBar.dispatchEvent('wheel', {
    bubbles: true,
    deltaY: -100,
  } as unknown as string)
  await expect(workbench).toHaveCount(1)
  await expect(aiLayout).toBeVisible()
  await expect(composer).toHaveValue(
    'Keep this draft when returning to the IDE',
  )
}
