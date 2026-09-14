import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.model-picker'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const toggle = Locator('button[name="model-picker"]')
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()

  const picker = Locator('.ChatModelPicker')
  const options = Locator('.ChatModelOption')
  const title = Locator('text=Models')
  await expect(picker).toBeVisible()
  await expect(picker).toHaveCSS('right', '16px')
  await expect(picker).toHaveCSS('max-width', '300px')
  await expect(options).toHaveCount(5)
  await expect(options.first()).toHaveCSS('overflow', 'hidden')
  await expect(options.first()).toHaveCSS('text-overflow', 'ellipsis')
  await expect(options.first()).toHaveCSS('white-space', 'nowrap')
  await expect(options.first()).toHaveAttribute('title', 'GPT-5.4')
  await expect(title).toBeVisible()
}
