import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.message-actions'

export const test: Test = async ({
  ClipBoard,
  Command,
  expect,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await ClipBoard.enableMemoryClipBoard()
  try {
    await Command.executeExtensionCommand('chat2.show')
    await Locator('textarea[name="composer"]').type('Copy this message')
    await Command.executeExtensionCommand('chat2.submit')

    const userMessage = Locator('.ChatMessageUser')
    const metadata = Locator('.ChatMessageUser .ChatMessageMetadata')
    const timestamp = Locator('.ChatMessageUser .ChatMessageTimestamp')
    const copyButton = Locator('.ChatMessageUser .ChatMessageCopyButton')
    await expect(metadata).toHaveCSS('opacity', '0')

    await userMessage.hover()

    await expect(metadata).toHaveCSS('opacity', '1')
    await expect(timestamp).toBeVisible()
    await expect(copyButton).toHaveAttribute('aria-label', 'Copy message')
    // eslint-disable-next-line e2e/no-direct-click
    await copyButton.click()
    await ClipBoard.shouldHaveText('Copy this message')
  } finally {
    await ClipBoard.disableMemoryClipBoard()
  }
}
