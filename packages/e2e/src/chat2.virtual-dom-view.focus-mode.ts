import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.focus-mode'

// Enable after integrating the host layout API from lvce-editor/lvce-editor#15716.
export const skip = 1

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const focusMode = Locator('.ChatAiNativeLayout')
  const toggle = Locator('button[name="toggle-focus-mode"]')
  await expect(toggle).toHaveAttribute('title', 'Focus entirely on chat')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')
  await expect(toggle).toHaveAttribute('title', 'Return to IDE layout')
  await expect(focusMode).toBeVisible()
  const activityBar = Locator('.ActivityBar')
  await expect(activityBar).toBeVisible()
  const sessions = Locator('.ChatSessions')
  await expect(sessions).toBeVisible()
  const composer = Locator('.ChatComposer')
  await expect(composer).toHaveCount(1)
  const task = Locator('.ChatTaskButton').first()
  // eslint-disable-next-line e2e/no-direct-click
  await task.click()
  const messages = Locator('.ChatMessages')
  await expect(messages).toBeVisible()
  const tasks = Locator('.ChatTaskButton')
  await expect(tasks).toHaveCount(20)
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(focusMode).toHaveCount(0)
  const main = Locator('.Main')
  await expect(main).toBeVisible()
}
