import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.auto-scroll'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Long message '.repeat(400))
  await Command.executeExtensionCommand('chat2.submit')

  const messages = Locator('.ChatMessages')
  await expect(messages).not.toHaveJSProperty('scrollTop', 0)
}
