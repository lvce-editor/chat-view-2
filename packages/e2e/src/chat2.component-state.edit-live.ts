import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.component-state.edit-live'

export const test: Test = async ({
  Command,
  ComponentState,
  Developer,
  Editor,
  expect,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  await expect(composer).toBeVisible()
  await Developer.openComponentState()

  const components = await ComponentState.getComponents()
  const component = components.find((item) => item.moduleId === 'ExtensionView')
  if (!component?.editable) {
    throw new Error(
      `Expected an editable Chat 2 component, got ${JSON.stringify(components)}`,
    )
  }
  const card = Locator(`.ComponentStateCard[data-uid="${component.uid}"]`)
  const cardTitle = card.locator('.ComponentStateCardTitle')
  const cardStatus = card.locator('.ComponentStateCardStatus')
  await expect(card).toBeVisible()
  await expect(cardTitle).toHaveText('Chat 2 (extension)')
  await expect(cardStatus).toHaveText('Open JSON state')
  // eslint-disable-next-line e2e/no-direct-click -- the card click and live editor subscription are the behavior under test
  await card.click()

  const selectedTabTitle = Locator('.MainTabSelected .TabTitle')
  await expect(selectedTabTitle).toHaveText(`${component.uid}.json`)
  const editor = Locator('.Editor')
  await expect(editor).toBeVisible()
  const state = JSON.parse(await Editor.getText())
  await Editor.setText(
    `${JSON.stringify({ ...state, draft: 'Live component state' }, null, 2)}\n`,
  )

  await expect(composer).toHaveValue('Live component state')
  const updatedState = await ComponentState.getState<{
    readonly draft: string
  }>(component.uid)
  if (updatedState.draft !== 'Live component state') {
    throw new Error(
      `Expected Chat 2 draft to update, got ${updatedState.draft}`,
    )
  }
}
