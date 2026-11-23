import type { Test } from '@lvce-editor/test-with-playwright'
import { runChatAction } from './_ChatCommands.ts'

export const name = 'chat2.virtual-dom-view.model-selection'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const toggle = Locator('button[name="model-picker"]')
  const hiddenPicker = Locator('.ChatModelPickerHidden')
  const picker = Locator('.Chat2ModelPicker')
  await expect(toggle).toContainText('GPT-5.4')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(hiddenPicker).toHaveCount(0)
  await expect(picker).toHaveCount(0)
  await runChatAction(Command, 'model-picker')

  const option = Locator('button[name="model:gpt-5.4-mini"]')
  await expect(option).toContainText('GPT-5.4 Mini')
  await runChatAction(Command, 'model:gpt-5.4-mini')

  await expect(toggle).toContainText('GPT-5.4 Mini')
  const thinkingToggle = Locator('button[name="thinking-mode-picker"]')
  const thinkingPopup = Locator('.ChatThinkingModePopup')
  await expect(thinkingToggle).toContainText('Medium')
  await expect(thinkingPopup).toHaveCount(0)
  await runChatAction(Command, 'thinking-mode-picker')
  await expect(thinkingPopup).toHaveCount(1)
  const highThinking = Locator('button[name="thinking-mode:high"]')
  const thinkingOptions = Locator('.ChatThinkingModeOption')
  await expect(thinkingOptions).toHaveCount(3)
  await runChatAction(Command, 'thinking-mode:high')
  await expect(thinkingToggle).toContainText('High')
  await expect(thinkingPopup).toHaveCount(0)
  await runChatAction(Command, 'thinking-mode-picker')
  await expect(highThinking).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(picker).toHaveCount(0)
  await expect(hiddenPicker).toHaveCount(0)
}
