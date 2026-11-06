import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.activity'

export const test: Test = async ({
  ChatView2,
  Command,
  expect,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await ChatView2.show()

  await ChatView2.typeComposer('Inspect the workspace')
  // Submit through the view event queue so the preceding input is handled first.
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="submit"]').click()

  const toggle = ChatView2.activityToggleButton()
  await expect(toggle).toContainText('1 step completed')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await ChatView2.expandActivity()

  const activity = ChatView2.activityItems()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(activity).toHaveCount(1)
  await expect(activity).toContainText('Inspecting workspace')
  await expect(activity).toContainText('3 relevant files')
}
