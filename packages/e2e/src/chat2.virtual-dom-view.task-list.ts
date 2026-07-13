import type { Test } from '@lvce-editor/test-with-playwright'
import { showChat2 } from './_chat2.virtual-dom-view.shared.ts'

export const name = 'chat2.virtual-dom-view.task-list'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await showChat2(Command)

  const tasks = Locator('.ChatTaskButton')
  const composer = Locator('textarea[name="composer"]')
  const submit = Locator('button[name="submit"]')
  await expect(tasks).toHaveCount(20)
  await expect(composer).toBeVisible()
  await expect(submit).toBeVisible()
}
