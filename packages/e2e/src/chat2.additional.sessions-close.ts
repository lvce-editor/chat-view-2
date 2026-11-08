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

export const name = 'chat2.additional.sessions-close'

export const test: Test = async (api) => {
  await prepareChat(api)
  await api.Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await openTask(api, 0)
  const toggle = api.Locator('button[name="toggle-sessions"]')
  await toggle.click()
  await toggle.click()
  await api.expect(toggle).toHaveAttribute('aria-expanded', 'false')
}
