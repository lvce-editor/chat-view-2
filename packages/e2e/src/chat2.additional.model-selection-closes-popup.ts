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

export const name = 'chat2.additional.model-selection-closes-popup'

export const test: Test = async (api) => {
  await prepareChat(api)
  const toggle = api.Locator('button[name="model-picker"]')
  await runChatAction(api.Command, 'model-picker')
  const option = api.Locator('button[name="model:gpt-5.4-mini"]')
  await api.expect(option).toBeVisible()
  await runChatAction(api.Command, 'model:gpt-5.4-mini')
  await api.expect(toggle).toContainText('GPT-5.4 Mini')
  await api.expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await api.expect(api.Locator('.Chat2ModelPicker')).toHaveCount(0)
}
