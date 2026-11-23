import type { Test, TestApi } from '@lvce-editor/test-with-playwright'
import { runChatAction } from './fixtures/ChatCommands.ts'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.Command.execute('SideBar.show', 'chat2.views.chat', true)
}

export const name = 'chat2.additional.archive-task-01'

export const test: Test = async (api) => {
  await prepareChat(api)
  const task = api.Locator('.ChatTaskButton').nth(0)
  await api.expect(task).toHaveText('Add worker memory usage')
  await runChatAction(api.Command, api.Locator('.ChatTaskArchiveButton').nth(0))
  await api.expect(api.Locator('.ChatTaskButton')).toHaveCount(19)
  await api
    .expect(api.Locator('.ChatTaskButton').nth(0))
    .toHaveText('Fix quickpick beforeinput crash')
}
