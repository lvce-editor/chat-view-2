import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const prepareChat = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
}

export const name = 'chat2.additional.status-command-empty-session'

export const test: Test = async (api) => {
  await prepareChat(api)
  await api.Command.executeExtensionCommand('chat2.newChat')
  const composer = api.Locator('textarea[name="composer"]')
  await composer.type('/status')
  await composer.dispatchEvent('focus', { bubbles: true } as unknown as string)
  await api.expect(composer).toBeFocused()
  await api
    .expect(api.Locator('button[name="submit"]'))
    .toHaveAttribute('disabled', null)
  await api.KeyBoard.press('Enter')
  await api.expect(api.Locator('.ChatStatusPopup')).toBeVisible()
  await api
    .expect(api.Locator('.ChatStatusPopup'))
    .toContainText('No session yet')
  await api.expect(api.Locator('.ChatMessageUser')).toHaveCount(0)
}
