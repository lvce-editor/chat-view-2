import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.draft-reload'
export const skip = 1

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await composer.type('Keep this draft across reloads')

  await Command.execute('Window.reload')

  await expect(composer).toHaveValue('Keep this draft across reloads')
}
