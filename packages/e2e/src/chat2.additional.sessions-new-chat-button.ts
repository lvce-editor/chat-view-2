import type { Test, TestApi } from '@lvce-editor/test-with-playwright'
import { openChatTask, runChatAction } from './fixtures/ChatCommands.ts'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.Command.execute('SideBar.show', 'chat2.views.chat', true)
}

export const name = 'chat2.additional.sessions-new-chat-button'

export const test: Test = async (api) => {
  await prepareChat(api)
  await api.Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await openChatTask(api.Command, api.Locator('.ChatTaskButton').first())
  await api.expect(api.Locator('.ChatDetailView')).toBeVisible()
  await runChatAction(api.Command, 'new-task')
  await api.expect(api.Locator('.ChatDetailTitle')).toHaveCount(0)
  await api.expect(api.Locator('textarea[name="composer"]')).toHaveValue('')
}
