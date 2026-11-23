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

export const name = 'chat2.additional.model-option-mini-title'

export const test: Test = async (api) => {
  await prepareChat(api)
  const toggle = api.Locator('button[name="model-picker"]')
  await runChatAction(api.Command, toggle)
  const option = api.Locator('button[name="model:gpt-5.4-mini"]')
  await api.expect(option).toBeVisible()
  await api.expect(option).toHaveAttribute('title', 'GPT-5.4 Mini')
}
