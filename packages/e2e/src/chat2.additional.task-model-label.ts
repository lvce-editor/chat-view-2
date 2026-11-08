import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
}

export const name = 'chat2.additional.task-model-label'

export const test: Test = async (api) => {
  await prepareChat(api)
  // eslint-disable-next-line e2e/no-direct-click -- open the visible seeded task
  await api.Locator('.ChatTaskButton').first().click()
  await api.expect(api.Locator('.ChatDetailView')).toBeVisible()
  await api
    .expect(api.Locator('button[name="model-picker"]'))
    .toContainText('GPT-5.4')
}
