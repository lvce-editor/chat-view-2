import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.message-links'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Inspect https://example.com')
  await Command.executeExtensionCommand('chat2.submit')

  const link = Locator('.ChatMessageUser .ChatMessageLink')
  await expect(link).toHaveAttribute('href', 'https://example.com')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toHaveCSS('color', 'rgb(77, 148, 255)')
}
