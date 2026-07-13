import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.changed-files'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Make a scoped change')
  await Command.executeExtensionCommand('chat2.submit')

  const changes = Locator('.ChatChanges')
  await expect(changes).toContainText('Changed 1 file · 2 checks passed')
  const revert = Locator('button[name="revert"]')
  // eslint-disable-next-line e2e/no-direct-click
  await revert.click()
  const revertedMessage = Locator('text=Reverted 1 changed file.')
  await expect(revertedMessage).toBeVisible()
}
