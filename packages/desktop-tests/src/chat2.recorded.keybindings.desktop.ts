/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
// Playwright handles are mutable test drivers.
// cspell:ignore domcontentloaded
import type { expect as Expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'

interface Context {
  readonly electronApp: ElectronApplication
  readonly expect: typeof Expect
  readonly page: Page
}

export const name = 'chat2.recorded.keybindings.desktop'

export const test = async ({
  electronApp,
  expect,
  page,
}: Context): Promise<void> => {
  try {
    await page.locator('.ActivityBar').waitFor({ timeout: 60_000 })
    const config = await electronApp.evaluate(() => process.env.XDG_CONFIG_HOME)
    assert.ok(config)
    const profileRoot = dirname(resolve(config))
    const temporaryRoot = resolve(tmpdir())
    assert.ok(
      profileRoot.startsWith(
        `${temporaryRoot}${sep}test-with-playwright-electron-`,
      ),
    )
    await mkdir(join(config, 'lvce'), { recursive: true })
    await writeFile(
      join(config, 'lvce', 'settings.json'),
      JSON.stringify({ 'chat2.useMockBackend': true }),
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.ActivityBar').waitFor({ timeout: 60_000 })
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+Shift+P`)
    await page.getByRole('combobox').fill('>Chat 2: Show')
    await page
      .getByRole('option')
      .filter({ hasText: 'Chat 2: Show' })
      .first()
      .click()
    const composer = page.locator('textarea[name="composer"]')
    for (const shortcut of [`${modifier}+N`, `${modifier}+Alt+N`]) {
      await composer.fill('Start a conversation')
      await expect(page.locator('button[name="submit"]')).toBeEnabled()
      await page.locator('button[name="submit"]').click()
      await expect(page.locator('.ChatMessageUser')).toHaveCount(1)
      await composer.fill('Discard this draft')
      await expect(page.locator('button[name="submit"]')).toBeEnabled()
      await expect(composer).toBeFocused()
      await page.keyboard.press(shortcut)
      await expect(page.locator('.ChatMessageUser')).toHaveCount(0)
      await expect(page.locator('.ChatMessageAssistant')).toHaveCount(0)
      await expect(composer).toHaveValue('')
      await expect(composer).toBeFocused()
    }
  } finally {
    try {
      await electronApp.evaluate(({ app }) => app.exit(0))
    } catch {
      // Exiting the isolated application closes the evaluation target.
    }
  }
}
