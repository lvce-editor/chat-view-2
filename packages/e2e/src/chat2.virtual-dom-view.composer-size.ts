import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.composer-size'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await expect(composer).toHaveCSS('field-sizing', 'content')
  await expect(composer).toHaveCSS('height', '32px')
  await expect(composer).toHaveCSS('max-height', '180px')
}
