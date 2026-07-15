import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.submit-enter'
export const skip = 1

export const test: Test = async ({
  Command,
  expect,
  KeyBoard,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await composer.type('Build a smaller chat view')
  await composer.dispatchEvent('focus', { bubbles: true } as unknown as string)
  await new Promise((resolve) => {
    setTimeout(resolve, 200)
  })
  await KeyBoard.press('Enter')

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
