import type { Test } from '@lvce-editor/test-with-playwright'
import { showChat2 } from './_chat2.virtual-dom-view.shared.ts'

export const name = 'chat2.virtual-dom-view.submit-enter'

export const test: Test = async ({
  Command,
  expect,
  KeyBoard,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await showChat2(Command)

  const composer = Locator('textarea[name="composer"]')
  // eslint-disable-next-line e2e/no-direct-click
  await composer.click()
  await composer.type('Build a smaller chat view')
  const focusedComposer = Locator('.ChatComposerInputFocused')
  await expect(focusedComposer).toBeVisible()
  await expect(composer).toBeFocused()
  await KeyBoard.press('Enter')

  const detail = Locator('.ChatDetailView')
  const userMessage = Locator('.ChatMessageUser')
  const assistantMessage = Locator(
    'text=This is a mock response. Chat 2 is not connected to an API yet.',
  )
  await expect(detail).toBeVisible()
  await expect(userMessage).toContainText('Build a smaller chat view')
  await expect(assistantMessage).toBeVisible()
}
