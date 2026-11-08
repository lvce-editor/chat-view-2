import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

/* eslint-disable e2e/no-direct-click */

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
}

const openTask = async (api: TestApi, index: number): Promise<void> => {
  await api.Locator('.ChatTaskButton').nth(index).click()
  await api.expect(api.Locator('.ChatDetailView')).toBeVisible()
}

export const name = 'chat2.additional.new-chat-clears-selection'

export const test: Test = async (api) => {
  await prepareChat(api)
  await openTask(api, 0)
  await api.Command.executeExtensionCommand('chat2.newChat')
  await api.expect(api.Locator('.ChatDetailTitle')).toHaveCount(0)
  await api.expect(api.Locator('.ChatListView')).toBeVisible()
  await api.expect(api.Locator('textarea[name="composer"]')).toHaveValue('')
}
