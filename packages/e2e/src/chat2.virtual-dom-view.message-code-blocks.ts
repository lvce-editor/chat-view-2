import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.message-code-blocks'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type(
    'Show this JSON:\n```json\n{"jsonrpc":"2.0","id":1}\n```',
  )
  await Command.executeExtensionCommand('chat2.submit')

  const codeBlock = Locator('.ChatMessageUser .ChatCodeBlock')
  const key = Locator('.ChatMessageUser .ChatCodeTokenKey')
  const string = Locator('.ChatMessageUser .ChatCodeTokenString')
  const number = Locator('.ChatMessageUser .ChatCodeTokenNumber')
  await expect(codeBlock).toHaveCount(1)
  await expect(key).toHaveText('"jsonrpc"')
  await expect(string).toHaveText('"2.0"')
  await expect(number).toHaveText('1')
  await expect(codeBlock).toHaveCSS('white-space', 'pre-wrap')
}
