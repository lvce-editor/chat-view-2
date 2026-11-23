import type { Test } from '@lvce-editor/test-with-playwright'
import { runChatAction, runChatViewCommand } from './_ChatCommands.ts'

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
  const hiddenPicker = Locator('.ChatModelPickerHidden')
  const picker = Locator('.Chat2ModelPicker')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(hiddenPicker).toHaveCount(0)
  await expect(picker).toHaveCount(0)
  await runChatAction(Command, 'model-picker')

  const options = Locator('.ChatModelOption')
  const title = Locator('text=Models')
  await expect(picker).toBeVisible()
  await expect(picker).toHaveJSProperty('offsetTop', -199)
  await expect(picker).toHaveCSS('right', '16px')
  await expect(picker).toHaveCSS('max-width', '300px')
  await expect(picker).toHaveCSS('overflow-y', 'auto')
  await expect(picker).toHaveCSS('scrollbar-width', 'thin')
  await expect(options).toHaveCount(5)
  await expect(options.first()).toHaveCSS('overflow', 'hidden')
  await expect(options.first()).toHaveCSS('text-overflow', 'ellipsis')
  await expect(options.first()).toHaveCSS('white-space', 'nowrap')
  await expect(options.first()).toHaveAttribute('title', 'GPT-5.4')
  await expect(title).toBeVisible()
  await expect(hiddenPicker).toHaveCount(0)

  // Locator.type focuses the control without committing a click event.
  await toggle.type('')
  await expect(toggle).toBeFocused()
  await KeyBoard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(hiddenPicker).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  // Escape also works while focus is on a model option.
  await runChatAction(Command, 'model-picker')
  await expect(picker).toBeVisible()
  const lastOption = Locator(
    'button[name="model:openrouter/test/api-bad-response"]',
  )
  await lastOption.type('')
  await expect(lastOption).toBeFocused()
  await KeyBoard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(hiddenPicker).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  // Escape works with focus in the composer and leaves its contents intact.
  await runChatAction(Command, 'model-picker')
  await expect(picker).toBeVisible()
  const composer = Locator('textarea[name="composer"]')
  await composer.type('keep this draft')
  await expect(composer).toBeFocused()
  await KeyBoard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(hiddenPicker).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(composer).toHaveValue('keep this draft')

  // Clicking the composer outside the picker dismisses it.
  await runChatAction(Command, 'model-picker')
  await expect(picker).toBeVisible()
  await runChatViewCommand(
    Command,
    'handleViewCommand',
    'handleModelPickerOutsideClick',
    'composer',
    'keep this draft',
  )
  await expect(picker).toHaveCount(0)
  await expect(hiddenPicker).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(composer).toHaveValue('keep this draft')

  // Moving focus to another LVCE view also dismisses the picker.
  await runChatAction(Command, 'model-picker')
  await expect(picker).toBeVisible()
  await Command.execute('Layout.showSideBar', 'Explorer')
  await expect(picker).toHaveCount(0)
  await Command.executeExtensionCommand('chat2.show')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(hiddenPicker).toHaveCount(0)
}
