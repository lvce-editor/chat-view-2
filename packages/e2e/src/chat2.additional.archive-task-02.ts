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

export const name = 'chat2.additional.archive-task-02'

export const test: Test = async (api) => {
  await prepareChat(api)
  const task = api.Locator('.ChatTaskButton').nth(1)
  await api.expect(task).toHaveText('Fix quickpick beforeinput crash')
  await api.Locator('.ChatTaskArchiveButton').nth(1).click()
  await api.expect(api.Locator('.ChatTaskButton')).toHaveCount(19)
  await api
    .expect(api.Locator('.ChatTaskButton').nth(1))
    .toHaveText('Fix running extensions view')
}
