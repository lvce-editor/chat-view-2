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

export const name = 'chat2.additional.archive-last-task'

export const test: Test = async (api) => {
  await prepareChat(api)
  const tasks = api.Locator('.ChatTaskButton')
  await api.expect(tasks.nth(19)).toHaveText('Triage open PRs')
  await api.Locator('.ChatTaskArchiveButton').nth(19).click()
  await api.expect(tasks).toHaveCount(19)
  await api
    .expect(tasks.nth(18))
    .toHaveText('Enable TypeScript diagnostics e2e')
}
