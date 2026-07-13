import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.changed-files'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Make a scoped change')
  await Command.executeExtensionCommand('chat2.submit')

  const changes = Locator('.ChatChanges')
  await expect(changes).toContainText('5 files changed')
  await expect(changes).toContainText('+51')
  await expect(changes).toContainText('-10')

  const review = Locator('button[name="toggle-changes"]')
  // eslint-disable-next-line e2e/no-direct-click
  await review.click()
  const changedFiles = Locator('.ChatChangedFiles')
  await expect(changedFiles).toContainText(
    'packages/e2e/src/chat2.virtual-dom-view.changed-files.ts',
  )
  await expect(changedFiles).toContainText('+9')
  await expect(changedFiles).toContainText('-0')

  const revert = Locator('button[name="revert"]')
  // eslint-disable-next-line e2e/no-direct-click
  await revert.click()
  const revertedMessage = Locator('text=Reverted 5 changed files.')
  await expect(revertedMessage).toBeVisible()
}
