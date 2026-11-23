import type { Test, TestApi } from '@lvce-editor/test-with-playwright'
import { runChatAction } from './_ChatCommands.ts'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.Command.execute('SideBar.show', 'chat2.views.chat', true)
}

export const name = 'chat2.additional.thinking-mode-high'

export const test: Test = async (api) => {
  await prepareChat(api)
  const toggle = api.Locator('button[name="thinking-mode-picker"]')
  await runChatAction(api.Command, 'thinking-mode-picker')
  const option = api.Locator('button[name="thinking-mode:high"]')
  await api.expect(option).toBeVisible()
  await runChatAction(api.Command, 'thinking-mode:high')
  await api.expect(toggle).toContainText('High')
  await api.expect(api.Locator('.ChatThinkingModePopup')).toHaveCount(0)
}
