import type { Test } from '@lvce-editor/test-with-playwright'
import { showChat2 } from './_chat2.virtual-dom-view.shared.ts'

export const name = 'chat2.virtual-dom-view.submit-button'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await showChat2(Command)

  await Locator('textarea[name="composer"]').type('Submit with the button')
  const submit = Locator('button[name="submit"]')
  // eslint-disable-next-line e2e/no-direct-click
  await submit.click()

  await expect(Locator('.ChatDetailView')).toBeVisible()
  await expect(Locator('text=Submit with the button')).toBeVisible()
}
