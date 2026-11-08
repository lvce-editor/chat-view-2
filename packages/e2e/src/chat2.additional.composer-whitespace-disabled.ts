import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
}

export const name = 'chat2.additional.composer-whitespace-disabled'

export const test: Test = async (api) => {
  await prepareChat(api)
  const submit = api.Locator('button[name="submit"]')
  await api.ChatView2.typeComposer(' '.repeat(3))
  await api.expect(submit).toHaveJSProperty('disabled', true)
  await api.expect(api.Locator('.ChatMessageUser')).toHaveCount(0)
}
