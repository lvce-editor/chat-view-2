import type { Test, TestApi } from '@lvce-editor/test-with-playwright'
import { openChatTask } from './_ChatCommands.ts'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.Command.execute('SideBar.show', 'chat2.views.chat', true)
}

export const name = 'chat2.additional.task-model-label'

export const test: Test = async (api) => {
  await prepareChat(api)
  await openChatTask(api.Command, api.Locator('.ChatTaskButton').first())
  await api.expect(api.Locator('.ChatDetailView')).toBeVisible()
  await api
    .expect(api.Locator('button[name="model-picker"]'))
    .toContainText('GPT-5.4')
}
