import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.changed-files'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Make a scoped change')
  await Command.executeExtensionCommand('chat2.submit')

  const changes = Locator('.ChatChanges')
  await expect(changes).toContainText('Edited 5 files')
  await expect(changes).toContainText('+51')
  await expect(changes).toContainText('-10')
  await expect(changes).toContainText('Show 2 more files')
  const review = Locator('button[name="toggle-changes"]').first()
  // eslint-disable-next-line e2e/no-direct-click
  await review.click()
  const changedFiles = Locator('.ChatChangedFile')
  await expect(changedFiles).toHaveCount(5)
  const revert = Locator('button[name="revert"]')
  // eslint-disable-next-line e2e/no-direct-click
  await revert.click()
  const revertedMessage = Locator('text=Reverted 5 changed files.')
  await expect(revertedMessage).toBeVisible()
}
