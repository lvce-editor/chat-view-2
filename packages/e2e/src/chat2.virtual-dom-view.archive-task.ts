import type { Test } from '@lvce-editor/test-with-playwright'
import { runChatAction } from './_ChatCommands.ts'

export const name = 'chat2.virtual-dom-view.archive-task'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  const tasks = Locator('.ChatTaskButton')
  const archiveButtons = Locator('.ChatTaskArchiveButton')
  const firstArchiveButton = archiveButtons.first()
  await expect(tasks).toHaveCount(20)
  await expect(archiveButtons).toHaveCount(20)
  await expect(firstArchiveButton).toHaveAttribute(
    'aria-label',
    'Archive Add worker memory usage',
  )
  await expect(firstArchiveButton).toHaveAttribute('title', 'Archive')
  const archiveIcon = firstArchiveButton.locator('.ChatTaskArchiveIcon')
  await expect(archiveIcon).toHaveCount(1)

  await runChatAction(Command, firstArchiveButton)

  await expect(tasks).toHaveCount(19)
  await expect(archiveButtons).toHaveCount(19)
}
