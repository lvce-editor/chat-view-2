import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.focus-mode'
export const skip = 1

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const focusMode = Locator('.ChatFocusMode')
  const toggle = Locator('button[name="toggle-focus-mode"]')
  await expect(toggle).toHaveAttribute('title', 'Focus entirely on chat')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')
  await expect(toggle).toHaveAttribute('title', 'Return to IDE layout')
  await expect(focusMode).toBeVisible()
}
