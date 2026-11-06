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
  await Command.execute('Preferences.update', {
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Locator('textarea[name="composer"]').type('Copy this message')
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="submit"]').click()

  const metadata = Locator('.ChatMessageUser .ChatMessageMetadata')
  const timestamp = Locator('.ChatMessageUser .ChatMessageTimestamp')
  const copyButton = Locator('.ChatMessageUser .ChatMessageCopyButton')
  const assistantMetadata = Locator(
    '.ChatMessageAssistant .ChatMessageMetadata',
  )
  const assistantCopyButton = Locator(
    '.ChatMessageAssistant .ChatMessageCopyButton',
  )
  await expect(metadata).toHaveCSS('opacity', '0')
  await expect(assistantMetadata).toHaveCSS('opacity', '0')
  await timestamp.hover()
  await expect(timestamp).toContainText('ago')
  await expect(copyButton).toHaveAttribute('aria-label', 'Copy message')
  await expect(assistantMetadata).toHaveCount(1)
  await expect(assistantCopyButton).toHaveAttribute(
    'aria-label',
    'Copy message',
  )
  // eslint-disable-next-line e2e/no-direct-click
  await copyButton.click()
  await expect(copyButton).toHaveClass('ChatMessageCopyButtonCopied')
  await expect(copyButton).toHaveAttribute('aria-label', 'Copied')
  await ClipBoard.shouldHaveText('Copy this message')

  // eslint-disable-next-line e2e/no-direct-click
  await assistantCopyButton.click()
  await expect(assistantCopyButton).toHaveClass('ChatMessageCopyButtonCopied')
  await expect(assistantCopyButton).toHaveAttribute('aria-label', 'Copied')
  await ClipBoard.shouldHaveText(
    'I inspected the relevant files, made the scoped change, and verified the result.',
  )
}
