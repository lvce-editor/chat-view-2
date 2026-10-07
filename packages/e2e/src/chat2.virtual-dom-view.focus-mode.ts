import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.focus-mode'

export const test: Test = async ({ Command, expect, Locator, QuickPick }) => {
  await Command.execute('Preferences.update', {
    'chat2.experimentalFocusMode': true,
    'chat2.useMockBackend': true,
  })
  await Command.executeExtensionCommand('chat2.show')

  const focusMode = Locator('.ChatAiNativeLayout')
  const toggle = Locator('button[name="toggle-focus-mode"]')
  await expect(toggle).toHaveAttribute('title', 'Focus entirely on chat')
  await Command.executeExtensionCommand('chat2.toggleFocusMode')
  await expect(toggle).toHaveAttribute('title', 'Return to IDE layout')
  await expect(toggle).toHaveAttribute('aria-label', 'Return to IDE layout')
  await expect(focusMode).toBeVisible()
  const activityBar = Locator('.ActivityBar')
  await expect(activityBar).toBeVisible()
  const sessions = Locator('.ChatSessions')
  await expect(sessions).toBeVisible()
  const newChatButton = Locator('.ChatSessions .ChatNewTaskButton')
  await expect(newChatButton).toHaveText('New chat')
  const composer = Locator('.ChatComposer')
  await expect(composer).toHaveCount(1)
  const newConversation = Locator('.ChatNewConversation')
  const newConversationBody = Locator('.ChatNewConversationBody')
  const newConversationMessages = Locator(
    '.ChatNewConversationBody .ChatMessages',
  )
  await expect(newConversation).toBeVisible()
  await expect(newConversationBody).toHaveCSS('justify-content', 'center')
  await expect(newConversationMessages).toHaveCSS('flex', '0 0 auto')
  const composerInput = Locator('textarea[name="composer"]')
  await composerInput.type('Center the new chat composer')
  await expect(composerInput).toHaveValue('Center the new chat composer')
  // eslint-disable-next-line e2e/no-direct-click
  await Locator('button[name="submit"]').click()
  const userMessage = Locator('.ChatMessageUser')
  await expect(userMessage).toContainText('Center the new chat composer')
  await expect(newConversation).toHaveCount(0)
  const detailComposer = Locator('.ChatDetailView .ChatComposer')
  await expect(detailComposer).toBeVisible()
  await expect(composerInput).toBeFocused()
  const task = Locator('.ChatTaskButton').nth(1)
  // eslint-disable-next-line e2e/no-direct-click
  await task.click()
  const messages = Locator('.ChatMessages')
  await expect(messages).toBeVisible()
  await expect(newConversation).toHaveCount(0)
  const tasks = Locator('.ChatTaskButton')
  await expect(tasks).toHaveCount(21)
  // eslint-disable-next-line e2e/no-direct-click
  await newChatButton.click()
  await expect(newConversation).toBeVisible()
  const emptyTitle = Locator('.ChatDetailView .ChatEmptyTitle')
  await expect(emptyTitle).toBeVisible()
  await Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await expect(focusMode).toHaveCount(0)
  const main = Locator('.Main')
  await expect(main).toBeVisible()
  await QuickPick.open()
  await QuickPick.setValue('> AI-Native')
  await QuickPick.selectItem('View: Toggle AI-Native / IDE Layout')
  await expect(focusMode).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click
  await toggle.click()
  await expect(focusMode).toHaveCount(0)
  await expect(main).toBeVisible()
}
