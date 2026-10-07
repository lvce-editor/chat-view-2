import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.model-picker'

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

  const toggle = Locator('button[name="model-picker"]')
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()

  const picker = Locator('.Chat2ModelPicker')
  const options = Locator('.ChatModelOption')
  const title = Locator('text=Models')
  await expect(picker).toBeVisible()
  await expect(picker).toHaveJSProperty('offsetTop', -199)
  await expect(picker).toHaveCSS('right', '16px')
  await expect(picker).toHaveCSS('max-width', '300px')
  await expect(options).toHaveCount(5)
  await expect(options.first()).toHaveCSS('overflow', 'hidden')
  await expect(options.first()).toHaveCSS('text-overflow', 'ellipsis')
  await expect(options.first()).toHaveCSS('white-space', 'nowrap')
  await expect(options.first()).toHaveAttribute('title', 'GPT-5.4')
  await expect(title).toBeVisible()

  // Locator.type focuses the control without committing a click event.
  await toggle.type('')
  await expect(toggle).toBeFocused()
  await KeyBoard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  // Escape also works while focus is on a model option.
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()
  await expect(picker).toBeVisible()
  const lastOption = Locator(
    'button[name="model:openrouter/test/api-bad-response"]',
  )
  await lastOption.type('')
  await expect(lastOption).toBeFocused()
  await KeyBoard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  // Escape works with focus in the composer and leaves its contents intact.
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()
  await expect(picker).toBeVisible()
  const composer = Locator('textarea[name="composer"]')
  await composer.type('keep this draft')
  await expect(composer).toBeFocused()
  await KeyBoard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(composer).toHaveValue('keep this draft')
}
