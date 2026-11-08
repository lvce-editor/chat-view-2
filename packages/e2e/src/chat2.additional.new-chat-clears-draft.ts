import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
}

export const name = 'chat2.additional.new-chat-clears-draft'

export const test: Test = async (api) => {
  await prepareChat(api)
  await api
    .Locator('textarea[name="composer"]')
    .type('Discard this unfinished draft')
  await api.Command.executeExtensionCommand('chat2.newChat')
  await api.expect(api.Locator('textarea[name="composer"]')).toHaveValue('')
  await api.expect(api.Locator('.ChatMessageUser')).toHaveCount(0)
}
