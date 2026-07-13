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
  const messages = Locator('.ChatMessage')
  const messageAuthors = Locator('.ChatMessageAuthor')
  const assistantMessage = Locator(
    'text=I inspected the relevant files, made the scoped change, and verified the result.',
  )
  await expect(detail).toBeVisible()
  await expect(messages).toHaveCount(2)
  await expect(messageAuthors).toHaveCount(0)
  await expect(userMessage).toContainText('Build a smaller chat view')
  await expect(assistantMessage).toBeVisible()
}
