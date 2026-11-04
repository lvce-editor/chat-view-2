import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.draft-reload'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await composer.type('Keep this draft across reloads')

  // A real browser reload is also exercised by the static acceptance runner.
  await Main.closeAllEditors()
  await Command.executeExtensionCommand('chat2.show')

  await expect(composer).toHaveValue('Keep this draft across reloads')
}
