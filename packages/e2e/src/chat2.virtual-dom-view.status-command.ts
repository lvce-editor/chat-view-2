import type { Test } from '@lvce-editor/test-with-playwright'

export const name = 'chat2.virtual-dom-view.status-command'

export const test: Test = async ({
  Command,
  expect,
  KeyBoard,
  Locator,
  Main,
}) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')
  await Command.executeExtensionCommand('chat2.newChat')
  const submit = Locator('button[name="submit"]')
  const userMessages = Locator('.ChatMessageUser')
  const assistantMessages = Locator('.ChatMessageAssistant')
  const composer = Locator('textarea[name="composer"]')
  await composer.type('/status')
  await composer.dispatchEvent('focus', { bubbles: true } as unknown as string)
  await expect(submit).toHaveAttribute('disabled', null)
  await expect(composer).toBeFocused()
  await KeyBoard.press('Enter')
  const popup = Locator('.ChatStatusPopup')
  await expect(popup).toBeVisible()
  await expect(popup).toHaveCSS('position', 'absolute')
  await expect(popup).toContainText('No session yet')
  await expect(popup).toContainText('Context')
  await expect(popup).toContainText('Usage limit')
  await expect(composer).toHaveValue('')
  await expect(userMessages).toHaveCount(0)
  await expect(composer).toBeFocused()
  await KeyBoard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect(composer).toBeFocused()
  await composer.type('Normal message after status')
  await expect(composer).toHaveValue('Normal message after status')
  await expect(submit).toHaveAttribute('disabled', null)
  await expect(composer).toBeFocused()
  await KeyBoard.press('Enter')
  await expect(userMessages).toContainText('Normal message after status')
  await expect(assistantMessages).toBeVisible()
  await composer.type('/status')
  await expect(submit).toHaveAttribute('disabled', null)
  await expect(composer).toBeFocused()
  await KeyBoard.press('Enter')
  await expect(popup).toBeVisible()
  await expect(popup).toContainText('mock-task-')
  await expect(userMessages).toHaveCount(1)
  const close = Locator('button[name="close-status"]')
  // eslint-disable-next-line e2e/no-direct-click -- exercise the status close control
  await close.click()
  await expect(popup).toHaveCount(0)
  await expect(composer).toBeFocused()
  await composer.type('/status')
  await expect(submit).toHaveAttribute('disabled', null)
  await KeyBoard.press('Enter')
  await expect(popup).toBeVisible()
  const modelToggle = Locator('button[name="model-picker"]')
  // eslint-disable-next-line e2e/no-direct-click -- exercise model changes while status is open
  await modelToggle.click()
  const modelOption = Locator(
    'button[name="model:openrouter/test/api-bad-response"]',
  )
  await expect(modelOption).toBeVisible()
  // eslint-disable-next-line e2e/no-direct-click -- exercise model changes while status is open
  await modelOption.click()
  await expect(popup).toHaveCount(0)
}
