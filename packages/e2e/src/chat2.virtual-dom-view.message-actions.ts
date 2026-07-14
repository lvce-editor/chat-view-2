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
    await Command.execute('Preferences.update', {
      'chat2.useMockBackend': true,
    })
    await Command.executeExtensionCommand('chat2.show')
    await Locator('textarea[name="composer"]').type('Copy this message')
    await Command.executeExtensionCommand('chat2.submit')

    const metadata = Locator('.ChatMessageUser .ChatMessageMetadata')
    const copyButton = Locator('.ChatMessageUser .ChatMessageCopyButton')
    const assistantMetadata = Locator(
      '.ChatMessageAssistant .ChatMessageMetadata',
    )
    const assistantCopyButton = Locator(
      '.ChatMessageAssistant .ChatMessageCopyButton',
    )
    await expect(metadata).toHaveCSS('opacity', '0')
    await expect(copyButton).toHaveAttribute('aria-label', 'Copy message')
    await expect(assistantMetadata).toHaveCount(0)
    await expect(assistantCopyButton).toHaveCount(0)
    // eslint-disable-next-line e2e/no-direct-click
    await copyButton.click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await expect(copyButton).toHaveClass('ChatMessageCopyButtonCopied')
    await expect(copyButton).toHaveAttribute('aria-label', 'Copied')
    await ClipBoard.shouldHaveText('Copy this message')
  } finally {
    await ClipBoard.disableMemoryClipBoard()
  }
}
