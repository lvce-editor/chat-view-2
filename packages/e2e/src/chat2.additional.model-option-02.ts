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

export const name = 'chat2.additional.model-option-02'

export const test: Test = async (api) => {
  await prepareChat(api)
  await runChatAction(api.Command, 'model-picker')
  const option = api.Locator('button[name="model:gpt-5.4-mini"]')
  await api.expect(option).toBeVisible()
  await api.expect(option).toContainText('GPT-5.4 Mini')
}
