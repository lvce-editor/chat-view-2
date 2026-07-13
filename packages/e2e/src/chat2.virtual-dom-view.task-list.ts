import type { Test } from '@lvce-editor/test-with-playwright'
import { showChat2 } from './_chat2.virtual-dom-view.shared.ts'

export const name = 'chat2.virtual-dom-view.task-list'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await showChat2(Command)

  await expect(Locator('.ChatTaskButton')).toHaveCount(20)
  await expect(Locator('textarea[name="composer"]')).toBeVisible()
  await expect(Locator('button[name="submit"]')).toBeVisible()
}
