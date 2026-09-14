import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.openrouter-api-bad-response'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'openrouter/test/api-bad-response',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  const error = Locator('.ChatErrorBanner')
  await composer.type('Trigger an invalid OpenRouter response error')
  await Command.executeExtensionCommand('chat2.submit')

  await expect(error).toHaveText(
    "Openrouter reports request as invalid: [ApiIdParam] [previous_response_id] [invalid_id_prefix] Invalid 'previous_response_id': 'gen-123'. Expected an ID that begins with 'resp'. (E_OPENROUTER_API_BAD_RESPONSE, 400)",
  )
  await composer.type('Try again')
  await Command.executeExtensionCommand('chat2.submit')
  await expect(error).toHaveCount(0)
}
