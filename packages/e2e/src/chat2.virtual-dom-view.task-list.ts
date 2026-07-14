import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.task-list'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const tasks = Locator('.ChatTaskButton')
  const composerContainer = Locator('.ChatComposer')
  const composer = Locator('textarea[name="composer"]')
  const submit = Locator('button[name="submit"]')
  await expect(tasks).toHaveCount(20)
  await expect(tasks.first()).toHaveCSS('cursor', 'pointer')
  await expect(composerContainer).toHaveCSS('margin', '8px 16px 24px')
  await expect(composer).toBeVisible()
  await expect(submit).toBeVisible()
}
