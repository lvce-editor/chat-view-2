import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.new-chat'

export const test: Test = async ({
  Command,
  expect,
  KeyBoard,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const composer = Locator('textarea[name="composer"]')
  const submit = Locator('button[name="submit"]')
  const detailView = Locator('.ChatDetailView')
  const listView = Locator('.ChatListView')
  await composer.type('Start the first chat')
  // eslint-disable-next-line e2e/no-direct-click
  await submit.click()
  await expect(detailView).toBeVisible()
  await expect(composer).toHaveValue('')

  await composer.type('Discard this draft')
  await composer.dispatchEvent('focus', { bubbles: true } as unknown as string)
  await expect(submit).toHaveAttribute('disabled', null)
  await expect(composer).toBeFocused()
  await KeyBoard.press('Control+Alt+N')

  await expect(listView).toBeVisible()
  await expect(detailView).toHaveCount(0)
  await expect(composer).toHaveValue('')
  await expect(composer).toBeFocused()
}
