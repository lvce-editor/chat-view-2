import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.composer-scroll'

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')

  const composer = Locator('textarea[name="composer"]')
  const submit = Locator('button[name="submit"]')
  const messages = Locator('.ChatMessages')
  const messageContent = Locator('.ChatMessagesContent')
  const composerArea = Locator('.ChatMessages > .ChatComposerArea')
  const messageTable = Locator('.ChatMessageUser .ChatMessageTable')
  const longMessage = [
    'Long conversation with a table:',
    '',
    '| Row | Content |',
    '| --- | --- |',
    ...Array.from(
      { length: 80 },
      (_, index) =>
        `| ${index + 1} | ${'A long response remains readable. '.repeat(3)} |`,
    ),
  ].join('\n')
  await composer.type(longMessage)
  // eslint-disable-next-line e2e/no-direct-click
  await submit.click()

  await expect(messages).toHaveCSS('overflow-y', 'hidden')
  await expect(messageContent).toHaveCSS('overflow-y', 'auto')
  await expect(messageTable).toHaveCount(1)
  await expect(composerArea).toHaveCSS('position', 'static')
  await messageContent.dispatchEvent('wheel', {
    bubbles: true,
    deltaY: 1000,
  } as unknown as string)
  await expect(messageContent).not.toHaveJSProperty('scrollTop', 0)
  await expect(composerArea).toBeVisible()
}
