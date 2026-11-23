import type { Test } from '@lvce-editor/test-with-playwright'
import { runChatAction } from './_ChatCommands.ts'

export const name = 'chat2.virtual-dom-view.changed-files'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Make a scoped change')
  await runChatAction(Command, 'submit')

  const changes = Locator('.ChatChanges')
  await expect(changes).toContainText('Edited 5 files')
  await expect(changes).toContainText('+51')
  await expect(changes).toContainText('-10')
  await expect(changes).toContainText('Show 2 more files')
  const review = Locator('button[name="toggle-changes"]').first()
  await runChatAction(Command, review)
  const changedFiles = Locator('.ChatChangedFile')
  await expect(changedFiles).toHaveCount(5)
  const undoButton = Locator('button[name="revert"]')
  await expect(undoButton).toHaveCount(0)
}
