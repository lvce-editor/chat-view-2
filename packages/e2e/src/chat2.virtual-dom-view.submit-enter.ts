import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.submit-enter'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await composer.type('Build a smaller chat view')
  // Enter is contributed as a keybinding for this exact extension command.
  // The e2e harness does not retain DOM focus after typing into a virtual view.
  await Command.executeExtensionCommand('chat2.submit')

  const detail = Locator('.ChatDetailView')
  const userMessage = Locator('.ChatMessageUser')
  const assistantMessage = Locator(
    'text=This is a mock response. Chat 2 is not connected to an API yet.',
  )
  await expect(detail).toBeVisible()
  await expect(userMessage).toContainText('Build a smaller chat view')
  await expect(assistantMessage).toBeVisible()
}
