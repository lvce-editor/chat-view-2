import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.additional.image-generation-placeholder'

export const test: Test = async (api) => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.useMockBackend': true,
  })
  await api.ChatView2.show()
  const components = await api.ComponentState.getComponents()
  const view = components.find(
    (component) => component.moduleId === 'ExtensionView',
  )
  if (!view) throw new Error('Chat 2 view is not mounted')
  const state = await api.ComponentState.getState<{
    readonly selectedTask?: Readonly<Record<string, unknown>>
  }>(view.uid)
  const timestamp = new Date().toISOString()
  const runningTask = {
    createdAt: timestamp,
    events: [],
    id: 'image-generation-placeholder',
    imageGenerationActive: true,
    modelId: 'gpt-test',
    status: 'running',
    title: 'Image generation',
    updatedAt: timestamp,
  }
  await api.ComponentState.setState(view.uid, {
    ...state,
    selectedTask: runningTask,
  })

  const placeholder = api.Locator('.ChatImageGenerationPlaceholder')
  await api.expect(placeholder).toBeVisible()
  await api.expect(placeholder).toHaveAttribute('role', 'status')
  await api
    .expect(placeholder)
    .toHaveAttribute('aria-label', 'Generating image')

  await api.ComponentState.setState(view.uid, {
    ...state,
    selectedTask: { ...runningTask, status: 'interrupted' },
  })
  await api.expect(placeholder).toHaveCount(0)

  await api.ComponentState.setState(view.uid, {
    ...state,
    selectedTask: undefined,
  })
  await api.expect(placeholder).toHaveCount(0)
}
