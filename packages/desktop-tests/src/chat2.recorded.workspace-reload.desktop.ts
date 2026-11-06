/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
// Playwright handles are mutable drivers.
// cspell:ignore domcontentloaded
import type { expect as Expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface Context {
  readonly electronApp: ElectronApplication
  readonly expect: typeof Expect
  readonly page: Page
}
const folderOption = /Open Folder/u
const reloadOption = /Window: Reload/u
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
export const name = 'chat2.recorded.workspace-reload.desktop'
export const test = async ({
  electronApp,
  expect,
  page,
}: Context): Promise<void> => {
  try {
    const workspace = process.env.CHAT_DESKTOP_WORKSPACE
    assert.ok(workspace)
    await writeFile(join(workspace, 'fixture.txt'), 'workspace fixture\n')
    await page.locator('.ActivityBar').waitFor({ timeout: 60_000 })
    await electronApp.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async (): Promise<{
        canceled: boolean
        filePaths: string[]
      }> => ({ canceled: false, filePaths: [folder] })
      dialog.showOpenDialogSync = (): string[] => [folder]
    }, workspace)
    await page.keyboard.press(`${modifier}+Shift+P`)
    await page.getByRole('combobox').fill('>open folder')
    await page
      .getByRole('option')
      .filter({ hasText: folderOption })
      .first()
      .click()
    const search = async (): Promise<void> => {
      await page
        .getByRole('treeitem', { exact: true, name: 'fixture.txt' })
        .click()
      await expect(page.locator('.Editor:visible')).toContainText(
        'workspace fixture',
      )
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(globalThis.document.activeElement?.closest('.Editor')),
          ),
        )
        .toBe(true)
    }
    await search()
    process.stdout.write('workspace navigation before reload: pass\n')
    await Promise.all([
      page.waitForEvent('domcontentloaded'),
      (async (): Promise<void> => {
        await page.keyboard.press(`${modifier}+Shift+P`)
        await page.getByRole('combobox').fill('>reload')
        process.stdout.write('workspace reload command ready\n')
        await page.getByRole('option').filter({ hasText: reloadOption }).click()
        process.stdout.write('workspace reload command selected\n')
      })(),
    ])
    await page.locator('.ActivityBar').waitFor({ timeout: 60_000 })
    await search()
    process.stdout.write('workspace navigation after reload: pass\n')
  } catch (error) {
    let state = 'unavailable'
    try {
      state = await page.locator('body').innerText()
    } catch {
      /* The application may have exited. */
    }
    process.stderr.write(`Workspace state: ${state}\n`)
    throw error
  } finally {
    try {
      await electronApp.evaluate(({ app }) => app.exit(0))
    } catch {
      /* The application may already be closed. */
    }
  }
}
