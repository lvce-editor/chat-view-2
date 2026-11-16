import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.component-state.copy-command'

export const test: Test = async ({
  Command,
  ComponentState,
  expect,
  Locator,
  Main,
  QuickPick,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await expect(composer).toBeVisible()
  const components = await ComponentState.getComponents()
  const component = components.find((item) => item.moduleId === 'ExtensionView')
  if (!component) {
    throw new Error(
      `Expected a Chat 2 component, got ${JSON.stringify(components)}`,
    )
  }
  const initialState = await ComponentState.getState<Record<string, unknown>>(
    component.uid,
  )
  await ComponentState.setState(component.uid, {
    ...initialState,
    draft: 'Copy this live state',
  })
  await expect(composer).toHaveValue('Copy this live state')

  await QuickPick.open()
  await QuickPick.setValue('>copy component state')
  await QuickPick.selectItem('Chat 2: Copy Component State')

  const state = await ComponentState.getState<{ readonly draft: string }>(
    component.uid,
  )
  const { draft } = state
  if (draft !== 'Copy this live state') {
    throw new Error(`Expected the copied draft to remain live, got ${draft}`)
  }
}
