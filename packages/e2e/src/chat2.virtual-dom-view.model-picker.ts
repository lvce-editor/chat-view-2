import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.model-picker'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.executeExtensionCommand('chat2.show')

  const toggle = Locator('button[name="model-picker"]')
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()

  const picker = Locator('.ChatModelPicker')
  const options = Locator('.ChatModelOption')
  const title = Locator('text=OpenAI models')
  await expect(picker).toBeVisible()
  await expect(options).toHaveCount(2)
  await expect(title).toBeVisible()
}
