import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
}

export const name = 'chat2.additional.sessions-new-chat-button'

export const test: Test = async (api) => {
  await prepareChat(api)
  await api.Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  // eslint-disable-next-line e2e/no-direct-click -- select the visible mock session
  await api.Locator('.ChatTaskButton').first().click()
  await api.expect(api.Locator('.ChatDetailView')).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click -- exercise the sessions New chat button
  await api.Locator('.ChatSessions .ChatNewTaskButton').click()
  await api.expect(api.Locator('.ChatDetailTitle')).toHaveCount(0)
  await api.expect(api.Locator('textarea[name="composer"]')).toHaveValue('')
}
