import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.submit-button'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Submit with the button')
  const submit = Locator('button[name="submit"]')
  await expect(submit).toContainText('↑')
  // eslint-disable-next-line e2e/no-direct-click
  await submit.click()

  const detail = Locator('.ChatDetailView')
  const userMessage = Locator('.ChatMessageUser')
  await expect(detail).toBeVisible()
  await expect(userMessage).toContainText('Submit with the button')
}
