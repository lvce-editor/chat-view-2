import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.connection-error'

export const test: Test = async ({
  Command,
  ComponentState,
  expect,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')
  const composer = Locator('textarea[name="composer"]')
  await expect(composer).toBeVisible()

  const components = await ComponentState.getComponents()
  const view = components.find(
    (component) => component.moduleId === 'ExtensionView',
  )
  if (!view) throw new Error('Chat 2 view is not mounted')
  const state = await ComponentState.getState<Record<string, unknown>>(view.uid)
  const timestamp = new Date().toISOString()
  const banner = Locator('.ChatErrorBanner')
  const connectionMessage =
    'Could not reach the chat server. Check your connection and try again.'
  const backendMessage = 'Model request failed (503): Service unavailable'
  const messages = [
    ['Failed to fetch', connectionMessage],
    ['NetworkError when attempting to fetch resource.', connectionMessage],
    ['Load failed', connectionMessage],
    [backendMessage, backendMessage],
  ]
  for (const [message, expected] of messages) {
    await ComponentState.setState(view.uid, {
      ...state,
      selectedTask: {
        createdAt: timestamp,
        events: [{ id: 'error', message, timestamp, type: 'error' }],
        id: 'failed-chat',
        modelId: 'gpt-test',
        status: 'failed',
        title: 'Failed chat',
        updatedAt: timestamp,
      },
    })
    await expect(banner).toHaveText(expected)
  }
}
