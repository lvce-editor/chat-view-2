import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.recorded.image-generation'

export const test: Test = async (api) => {
  await api.Main.closeAllEditors()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('lvce-chat-2')
    request.onsuccess = (): void => resolve()
    request.onerror = (): void =>
      reject(request.error || new Error('Unable to clear chat test state'))
    request.onblocked = (): void => reject(new Error('Chat database is in use'))
  })
  await api.FileSystem.mkdir('memfs:///recorded-workspace/')
  await api.Workspace.setPath('memfs:///recorded-workspace/')
  await api.Command.execute('Preferences.update', {
    'chat2.backendUrl': 'http://127.0.0.1:8787',
    'chat2.computerUseEnabled': false,
    'chat2.selectedModelId': 'gpt-5.4-mini',
    'chat2.supportsStreaming': true,
    'chat2.useMockBackend': false,
  })
  await api.ChatView2.show()
  const components = await api.ComponentState.getComponents()
  const view = components.find(
    (component) => component.moduleId === 'ExtensionView',
  )
  if (!view) throw new Error('Chat 2 view is not mounted')
  const state = await api.ComponentState.getState<{
    readonly models: readonly Readonly<Record<string, unknown>>[]
  }>(view.uid)
  const { models } = state
  // Match the production catalog's thinking controls while using local replay.
  await api.ComponentState.setState(view.uid, {
    ...state,
    models: models.map((model) => ({
      ...model,
      thinkingModes: ['low', 'medium', 'high'],
    })),
    selectedThinkingMode: 'medium',
    thinkingModeEnabled: true,
  })
  await api
    .expect(api.Locator('button[name="thinking-mode-picker"]'))
    .toContainText('Medium')
  await api
    .Locator('textarea[name="composer"]')
    .type(
      'Generate a simple flat illustration of a blue circle on a white background.',
    )
  await api
    .expect(api.Locator('button[name="submit"]'))
    .toHaveAttribute('disabled', null)
  await api.KeyBoard.press('Enter')

  const image = api.Locator('.ChatMessageAssistant .ChatMessageImage')
  await api.expect(image).toBeVisible()
  await api.expect(image).toHaveAttribute('alt', 'Generated image 1.png')
  await api.expect(image).toHaveJSProperty('naturalWidth', 1)
  await api.expect(api.Locator('.ChatError, .ChatErrorBanner')).toHaveCount(0)

  await api.Main.closeAllEditors()
  await api.ChatView2.show()
  await api.expect(image).toBeVisible()
  await api.expect(image).toHaveJSProperty('naturalWidth', 1)
}
