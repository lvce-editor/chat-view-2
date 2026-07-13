import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.task-list'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.executeExtensionCommand('chat2.show')

  const tasks = Locator('.ChatTaskButton')
  const composer = Locator('textarea[name="composer"]')
  const submit = Locator('button[name="submit"]')
  await expect(tasks).toHaveCount(20)
  await expect(composer).toBeVisible()
  await expect(submit).toBeVisible()
}
