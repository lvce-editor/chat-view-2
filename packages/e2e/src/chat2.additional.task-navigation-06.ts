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

export const name = 'chat2.additional.task-navigation-06'

export const test: Test = async (api) => {
  await prepareChat(api)
  await openTask(api, 5)
  await api
    .expect(api.Locator('.ChatDetailTitle'))
    .toHaveText('Enable TypeScript autofix tests')
  await api
    .expect(api.Locator('.ChatMessageUser'))
    .toContainText('Enable TypeScript autofix tests')
  await api
    .expect(api.Locator('.ChatMessageAssistant'))
    .toContainText('I inspected the relevant files')
}
