import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.message-links'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type(
    'Inspect **bold** <img src=x onerror=alert(1)> [VS Code download page](https://code.visualstudio.com/Download), then https://example.com',
  )
  await Command.executeExtensionCommand('chat2.submit')

  const bold = Locator('.ChatMessageUser .ChatMessageText strong')
  await expect(bold).toHaveText('bold')
  const injectedImage = Locator('.ChatMessageUser .ChatMessageText img')
  await expect(injectedImage).toHaveCount(0)
  const links = Locator('.ChatMessageUser .ChatMessageLink')
  await expect(links).toHaveCount(2)
  const markdownLink = Locator(
    '.ChatMessageUser .ChatMessageLink[href="https://code.visualstudio.com/Download"]',
  )
  await expect(markdownLink).toHaveText('VS Code download page')
  await expect(markdownLink).toHaveAttribute('target', '_blank')
  await expect(markdownLink).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(markdownLink).toHaveCSS('color', 'rgb(77, 148, 255)')
  const bareLink = Locator(
    '.ChatMessageUser .ChatMessageLink[href="https://example.com"]',
  )
  await expect(bareLink).toHaveAttribute('target', '_blank')
}
