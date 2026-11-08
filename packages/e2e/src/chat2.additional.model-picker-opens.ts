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

export const name = 'chat2.additional.model-picker-opens'

export const test: Test = async (api) => {
  await prepareChat(api)
  const toggle = api.Locator('button[name="model-picker"]')
  await toggle.click()
  await api.expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await api.expect(api.Locator('.Chat2ModelPicker')).toBeVisible()
}
