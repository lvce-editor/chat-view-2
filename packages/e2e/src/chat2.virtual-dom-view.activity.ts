import type { Test } from '@lvce-editor/test-with-playwright'
import { runChatAction } from './_ChatCommands.ts'

export const name = 'chat2.virtual-dom-view.activity'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.execute('SideBar.show', 'chat2.views.chat', true)

  await Locator('textarea[name="composer"]').type('Inspect the workspace')
  // Submit through the view event queue so the preceding input is handled first.
  await runChatAction(Command, 'submit')

  const toggle = Locator('button[name="toggle-activity"]')
  await expect(toggle).toContainText('Worked for')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await runChatAction(Command, 'toggle-activity')

  const activity = Locator('.ChatActivityItem')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(activity).toHaveCount(1)
  await expect(activity).toContainText('Inspecting workspace')
  await expect(activity).toContainText('3 relevant files')
}
