import type { Test } from '@lvce-editor/test-with-playwright'
import { runChatAction } from './_ChatCommands.ts'

export const name = 'chat2.virtual-dom-view.submit-button'

export const test: Test = async ({ Command, expect, Locator, Main }) => {
  await Main.closeAllEditors()
  await Command.execute('Preferences.update', { 'chat2.useMockBackend': true })
  await Command.executeExtensionCommand('chat2.show')

  await Locator('textarea[name="composer"]').type('Submit with the button')
  const submit = Locator('button[name="submit"]')
  await expect(submit).toContainText('↑')
  await runChatAction(Command, 'submit')

  const detail = Locator('.ChatDetailView')
  const userMessage = Locator('.ChatMessageUser')
  await expect(detail).toBeVisible()
  await expect(userMessage).toContainText('Submit with the button')

  const stop = Locator('button[name="stop"]')
  await expect(stop).toContainText('■')
  await expect(stop).toHaveAttribute('aria-label', 'Stop task')
  await expect(submit).toBeHidden()
  await runChatAction(Command, 'stop')
  await expect(submit).toBeVisible()
}
