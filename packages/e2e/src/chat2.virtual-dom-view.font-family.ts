import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.font-family'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', {
    'chat2.fontFamily': 'monospace',
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const task = Locator('.ChatTaskButton').first()
  await expect(task).toHaveCSS('font-family', 'monospace')
}
