import type { Test } from '@lvce-editor/test-with-playwright'
import { showChat2 } from './_chat2.virtual-dom-view.shared.ts'

export const name = 'chat2.virtual-dom-view.submit-enter'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await showChat2(Command)

  const composer = Locator('textarea[name="composer"]')
  await composer.type('Build a smaller chat view')
  await composer.type('\n')

  await expect(Locator('.ChatDetailView')).toBeVisible()
  await expect(Locator('text=Build a smaller chat view')).toBeVisible()
  await expect(
    Locator(
      'text=This is a mock response. Chat 2 is not connected to an API yet.',
    ),
  ).toBeVisible()
}
