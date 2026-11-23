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

const openTask = async (api: TestApi, index: number): Promise<void> => {
  await openChatTask(api.Command, api.Locator('.ChatTaskButton').nth(index))
  await api.expect(api.Locator('.ChatDetailView')).toBeVisible()
}

export const name = 'chat2.additional.task-navigation-03'

export const test: Test = async (api) => {
  await prepareChat(api)
  await openTask(api, 2)
  await api
    .expect(api.Locator('.ChatDetailTitle'))
    .toHaveText('Fix running extensions view')
  await api
    .expect(api.Locator('.ChatMessageUser'))
    .toContainText('Fix running extensions view')
  await api
    .expect(api.Locator('.ChatMessageAssistant'))
    .toContainText('I inspected the relevant files')
}
