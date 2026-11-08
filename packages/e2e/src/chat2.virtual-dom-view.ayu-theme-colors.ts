import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.ayu-theme-colors'

export const test: Test = async ({ ColorTheme, Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.useMockBackend': true,
  })
  await ColorTheme.setColorTheme('ayu')
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('.ChatComposer')
  const composerInput = Locator('.ChatComposerInput')
  const submitButton = Locator('.ChatSubmitButton')
  await expect(composer).toHaveCSS('background-color', 'rgb(252, 252, 252)')
  await expect(composerInput).toHaveCSS('color', 'rgb(92, 97, 102)')
  await expect(submitButton).toHaveCSS('background-color', 'rgb(255, 170, 51)')
  await expect(submitButton).toHaveCSS('color', 'rgb(128, 74, 0)')

  await ColorTheme.setColorTheme('slime')
  await expect(composer).toHaveCSS('background-color', 'rgb(36, 41, 42)')
  await expect(composerInput).toHaveCSS('color', 'rgb(225, 225, 225)')
  await expect(submitButton).toHaveCSS('background-color', 'rgb(47, 98, 96)')
}
