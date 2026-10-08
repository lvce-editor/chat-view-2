import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.focus-mode'

export const test: Test = async ({ Command, expect, Locator, QuickPick }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const browserTabTitle = Locator('head title')
  const focusMode = Locator('.ChatAiNativeLayout')
  const toggle = Locator('button[name="toggle-focus-mode"]')
  await expect(toggle).toHaveAttribute('title', 'Focus entirely on chat')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')
  await expect(toggle).toHaveCount(0)
  await expect(focusMode).toBeVisible()
  await expect(browserTabTitle).toHaveText('Chat 2')
  const activityBar = Locator('.ActivityBar')
  await expect(activityBar).toBeVisible()
  const sessions = Locator('.ChatSessions')
  await expect(sessions).toBeVisible()
  const newChatButton = Locator('.ChatSessions .ChatNewTaskButton')
  const headerFocusButton = Locator('.ChatDetailHeader .ChatFocusModeButton')
  const headerNewChatButton = Locator('.ChatDetailHeader .ChatNewTaskButton')
  await expect(newChatButton).toHaveText('New chat')
  await expect(headerFocusButton).toHaveCount(0)
  await expect(headerNewChatButton).toHaveCount(0)
  const composer = Locator('.ChatComposer')
  await expect(composer).toHaveCount(1)
  const newConversationBody = Locator('.ChatConversationBody')
  const emptyTitle = Locator('.ChatDetailView .ChatEmptyTitle')
  const newConversationMessages = Locator('.ChatConversationBody .ChatMessages')
  await expect(emptyTitle).toBeVisible()
  await expect(newConversationBody).toHaveCSS('justify-content', 'center')
  await expect(newConversationMessages).toHaveCSS('flex', '0 0 auto')
  const composerInput = Locator('textarea[name="composer"]')
  await composerInput.type('Center the new chat composer')
  await expect(composerInput).toHaveValue('Center the new chat composer')
  await Command.executeExtensionCommand('chat2.submit')
  await expect(browserTabTitle).toHaveText('Center the new chat composer')
  const userMessage = Locator('.ChatMessageUser')
  await expect(userMessage).toContainText('Center the new chat composer')
  await expect(emptyTitle).toHaveCount(0)
  const detailComposer = Locator('.ChatDetailView .ChatComposer')
  await expect(detailComposer).toBeVisible()
  await expect(newConversationBody).toHaveCSS('justify-content', 'flex-start')
  const task = Locator('.ChatTaskButton').nth(2)
  // eslint-disable-next-line e2e/no-direct-click
  await task.click()
  await expect(browserTabTitle).toHaveText('Fix quickpick beforeinput crash')
  await expect(headerFocusButton).toHaveCount(0)
  await expect(headerNewChatButton).toHaveCount(0)
  const messages = Locator('.ChatMessages')
  await expect(messages).toBeVisible()
  await expect(emptyTitle).toHaveCount(0)
  await expect(newConversationBody).toHaveCSS('justify-content', 'flex-start')
  const tasks = Locator('.ChatTaskButton')
  await expect(tasks).toHaveCount(20)
  // eslint-disable-next-line e2e/no-direct-click
  await newChatButton.click()
  await expect(browserTabTitle).toHaveText('Chat 2')
  await expect(emptyTitle).toBeVisible()
  await expect(newConversationBody).toHaveCSS('justify-content', 'center')
  await expect(composerInput).toBeFocused()
  await composerInput.type('Type immediately after starting a new chat')
  await expect(composerInput).toHaveValue(
    'Type immediately after starting a new chat',
  )
  // Repeated requests must still focus the input when already on a new chat.
  // eslint-disable-next-line e2e/no-direct-click
  await newChatButton.click()
  await expect(composerInput).toHaveValue('')
  await expect(composerInput).toBeFocused()
  await composerInput.type('Another new chat')
  await expect(composerInput).toHaveValue('Another new chat')
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(focusMode).toHaveCount(0)
  await expect(browserTabTitle).toHaveText(
    'chat2.virtual-dom-view.focus-mode.html',
  )
  const main = Locator('.Main')
  await expect(main).toBeVisible()
  await QuickPick.open()
  await QuickPick.setValue('> AI-Native')
  await QuickPick.selectItem('View: Toggle AI-Native / IDE Layout')
  await expect(focusMode).toBeVisible()
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(focusMode).toHaveCount(0)
  await expect(main).toBeVisible()
}
