import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.openrouter-model-not-found'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'openrouter/test/model-not-found',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  const error = Locator('.ChatErrorBanner')
  await composer.type('Trigger an OpenRouter model-not-found error')
  await Command.executeExtensionCommand('chat2.submit')

  await expect(error).toHaveText(
    'The selected OpenRouter model could not be found. Check the model name and try again. (E_OPENROUTER_MODEL_NOT_FOUND, 404)',
  )
  await composer.type('Try again')
  await Command.executeExtensionCommand('chat2.submit')
  await expect(error).toHaveCount(0)
}
