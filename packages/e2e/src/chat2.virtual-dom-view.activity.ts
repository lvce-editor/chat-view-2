import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.activity'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Inspect the workspace')
  await Command.executeExtensionCommand('chat2.submit')

  const toggle = Locator('button[name="toggle-activity"]')
  await expect(toggle).toContainText('1 step completed')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()

  const activity = Locator('.ChatActivityItem')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(activity).toHaveCount(1)
  await expect(activity).toContainText('Inspecting workspace')
  await expect(activity).toContainText('3 relevant files')
}
