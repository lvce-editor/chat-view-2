import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.openrouter-too-many-requests'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'openrouter/test/too-many-requests',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  const error = Locator('.ChatErrorBanner')
  await composer.type('Trigger an OpenRouter rate limit')
  await Command.executeExtensionCommand('chat2.submit')

  await expect(error).toHaveText(
    'OpenRouter is rate limiting requests. Please wait a moment and try again. (E_OPENROUTER_TOO_MANY_REQUESTS, 429)',
  )
  await composer.type('Try again')
  await Command.executeExtensionCommand('chat2.submit')
  await expect(error).toHaveCount(0)
}
