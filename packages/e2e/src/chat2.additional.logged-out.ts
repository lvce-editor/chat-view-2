import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.additional.logged-out'

export const test: Test = async (api) => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.backendUrl': '',
    'chat2.useMockBackend': false,
  })
  await api.ChatView2.show()
  await api
    .expect(api.Locator('.ChatLoginTitle'))
    .toHaveText('Welcome to Chat 2')
  await api.expect(api.Locator('.ChatLoginContent')).toBeVisible()
  await api.expect(api.Locator('button[name="login"]')).toHaveText('Log in')
  await api.expect(api.Locator('textarea[name="composer"]')).toHaveCount(0)
  await api.Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await api.expect(api.Locator('.Workbench.AiNativeLayout')).toBeVisible()
  await api.expect(api.Locator('.ChatLoggedOut.ChatFocusMode')).toBeVisible()
  await api.expect(api.Locator('.ChatLoginContent')).toBeVisible()
  await api.expect(api.Locator('button[name="login"]')).toBeVisible()
  await api.expect(api.Locator('.ChatSessions')).toHaveCount(0)
}
