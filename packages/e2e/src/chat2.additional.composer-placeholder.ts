import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
}

export const name = 'chat2.additional.composer-placeholder'

export const test: Test = async (api) => {
  await prepareChat(api)
  await api
    .expect(api.Locator('textarea[name="composer"]'))
    .toHaveAttribute('placeholder', 'Describe a programming task')
}
