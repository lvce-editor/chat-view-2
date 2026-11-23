import type {
  ILocator,
  ILocatorExternal,
  Test,
  TestApi,
} from '@lvce-editor/test-with-playwright'
import { runChatAction, scrollChatContentIntoView } from './_ChatCommands.ts'

export const name = 'chat2.virtual-dom-view.composer-scroll'

const getScrollTop = async (
  Command: TestApi['Command'],
  messages: ILocatorExternal,
): Promise<number> => {
  const { actual } = await Command.execute(
    'TestFrameWork.checkConditionError',
    'toHaveJSProperty',
    (messages as ILocator)._parsed,
    { key: 'scrollTop' },
  )
  if (typeof actual !== 'number') {
    throw new TypeError('Expected the chat message scroll position')
  }
  return actual
}

export const test: Test = async ({ Command, expect, Locator }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')

  const composer = Locator('textarea[name="composer"]')
  const messages = Locator('.ChatMessages')
  const conversationBody = Locator('.ChatConversationBody')
  const composerArea = Locator('.ChatConversationBody > .ChatComposerArea')
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
  await runChatAction(Command, 'submit')

  await expect(messages).toHaveCSS('overflow-y', 'auto')
  await expect(conversationBody).toHaveCSS('flex-direction', 'column')
  await expect(messageTable).toHaveCount(1)
  await expect(composerArea).toHaveCSS('position', 'relative')
  await expect(composerArea).toBeVisible()
  await scrollChatContentIntoView(Command, '.ChatMessageUser')
  const initialScrollTop = await getScrollTop(Command, messages)
  await scrollChatContentIntoView(
    Command,
    '.ChatMessageUser .ChatMessageTable tbody tr:last-child',
  )
  const aiLayout = Locator('.ChatAiNativeLayout')
  await expect(aiLayout).toBeVisible()
  const scrollTop = await getScrollTop(Command, messages)
  if (scrollTop <= initialScrollTop) {
    throw new Error(
      `Expected chat messages to scroll down from ${initialScrollTop}, got ${scrollTop}`,
    )
  }
  await expect(composerArea).toBeVisible()
}
