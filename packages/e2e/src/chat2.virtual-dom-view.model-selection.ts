import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.model-selection'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const toggle = Locator('button[name="model-picker"]')
  await expect(toggle).toContainText('GPT-5.4')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()

  const option = Locator('button[name="model:gpt-5.4-mini"]')
  const picker = Locator('.ChatModelPicker')
  await expect(option).toContainText('GPT-5.4 Mini')
  // eslint-disable-next-line e2e/no-direct-click
  await option.click()

  await expect(toggle).toContainText('GPT-5.4 Mini')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(picker).toHaveCount(0)
}
