import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.auto-scroll'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')

  await Locator('textarea[name="composer"]').type(
    'Keep this message at the top',
  )
  await Command.executeExtensionCommand('chat2.submit')

  const messages = Locator('.ChatMessages')
  const latestTurn = Locator('.ChatTurnLatest')
  const userMessage = Locator('.ChatMessageUser')
  await expect(latestTurn).toBeVisible()
  await expect(userMessage).toBeVisible()
  await expect(messages).toHaveJSProperty('scrollTop', 0)
}
