import type { Test } from '@lvce-editor/test-with-playwright'

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
  await expect(firstArchiveButton.locator('.ChatTaskArchiveIcon')).toHaveCount(
    1,
  )

  // eslint-disable-next-line e2e/no-direct-click
  await firstArchiveButton.click()

  await expect(tasks).toHaveCount(19)
  await expect(archiveButtons).toHaveCount(19)
}
