/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
// Playwright handles are intentionally mutable test drivers.
// cspell:ignore requestfailed
import type { expect as Expect } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

interface Context {
  readonly electronApp: ElectronApplication
  readonly expect: typeof Expect
  readonly page: Page
}

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
const layoutOption = /View: Toggle AI-Native \/ IDE Layout/u
const folderOption = /Open Folder/u
const addition = /left\s*\+\s*right/u
const weatherPrompt =
  'What is the weather forecast for Berlin, Germany on November 4, 2026? Use web search and cite your sources.'
const fixtures: Readonly<Record<string, string>> = {
  'a.txt': 'first original\n',
  'b.txt': 'second original\n',
  'package.json': JSON.stringify({
    name: 'desktop-chat-fixture',
    private: true,
    scripts: { test: 'node --test' },
    type: 'module',
    version: '1.0.0',
  }),
  'README.md':
    'A small arithmetic project. Authentication is implemented in src/auth.ts.\n',
  'src/add.js': 'export const add = (left, right) => left - right\n',
  'src/auth.ts': "export const mechanism = 'disk-token'\n",
  'test/add.test.js':
    "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { add } from '../src/add.js'\ntest('adds numbers', () => assert.equal(add(2, 3), 5))\n",
}

export const name = 'chat2.recorded.desktop'

export const test = async ({
  electronApp,
  expect,
  page,
}: Context): Promise<void> => {
  const workspace = process.env.CHAT_DESKTOP_WORKSPACE
  const replayUrl = process.env.CHAT_DESKTOP_REPLAY_URL
  assert.ok(
    workspace && replayUrl,
    'Run desktop tests through the repository e2e wrapper',
  )
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      process.stderr.write(`Desktop console: ${message.text()}\n`)
    }
  })
  page.on('requestfailed', (request) =>
    process.stderr.write(
      `Desktop request failed: ${request.url()} ${request.failure()?.errorText}\n`,
    ),
  )
  const command = async (query: string, label: RegExp): Promise<void> => {
    await page.keyboard.press(`${modifier}+Shift+P`)
    await page.getByRole('combobox').fill(`>${query}`)
    await page.getByRole('option').filter({ hasText: label }).first().click()
  }
  const toggleLayout = (): Promise<void> => command('toggle ai', layoutOption)
  const newChat = async (): Promise<void> => {
    await page.locator('.ChatSessions .ChatNewTaskButton').click()
    await expect(page.locator('textarea[name="composer"]')).toHaveValue('')
  }
  const submit = async (message: string): Promise<void> => {
    const composer = page.locator('textarea[name="composer"]')
    await composer.fill(message)
    await expect(page.locator('button[name="submit"]')).toBeEnabled()
    await composer.press('Enter')
    await expect(page.locator('.ChatMessageUser').last()).toContainText(message)
  }
  const complete = async (count: number): Promise<void> => {
    await expect(
      page.locator('.ChatTaskStatus-completed, .ChatTaskStatus-failed'),
    ).toHaveCount(count, { timeout: 120_000 })
    await expect(
      page.locator(
        '.ChatTaskStatus-running, .ChatTaskStatus-stopping, .ChatTaskStatus-failed, .ChatError, .ChatErrorBanner',
      ),
    ).toHaveCount(0)
  }
  const control = async (action: 'pause' | 'resume'): Promise<void> => {
    const response = await fetch(`${replayUrl}/__replay/${action}`, {
      method: 'POST',
    })
    assert.equal(response.status, 200)
  }
  const openFile = async (path: string): Promise<void> => {
    await page.keyboard.press(`${modifier}+P`)
    await page.getByRole('combobox').fill(path)
    await page.getByRole('option').first().click()
  }
  try {
    // Verify the launcher's private application state before writing settings.
    const profile = await electronApp.evaluate(() => ({
      cache: process.env.XDG_CACHE_HOME,
      config: process.env.XDG_CONFIG_HOME,
      data: process.env.XDG_DATA_HOME,
      state: process.env.XDG_STATE_HOME,
    }))
    assert.ok(profile.config)
    const profileRoot = dirname(resolve(profile.config))
    const temporaryRoot = resolve(tmpdir())
    assert.ok(
      profileRoot.startsWith(
        `${temporaryRoot}${sep}test-with-playwright-electron-`,
      ),
      'Refusing to write outside the isolated test profile',
    )
    for (const path of [
      profile.cache,
      profile.config,
      profile.data,
      profile.state,
    ]) {
      assert.ok(path && dirname(resolve(path)) === profileRoot)
    }
    const settings = join(profile.config, 'lvce', 'settings.json')
    await mkdir(dirname(settings), { recursive: true })
    await writeFile(
      settings,
      JSON.stringify({
        'chat2.backendUrl': replayUrl,
        'chat2.computerUseEnabled': false,
        'chat2.openAiWebSearch': true,
        'chat2.selectedModelId': 'gpt-5.4-mini',
        'chat2.supportsStreaming': true,
        'chat2.useMockBackend': false,
      }),
    )
    for (const [path, contents] of Object.entries(fixtures)) {
      const target = join(workspace, path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, contents)
    }
    await page.reload()
    await page.locator('.ActivityBar').waitFor({ timeout: 60_000 })
    // Select the controlled fixture in the real Open Folder flow.
    await electronApp.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = async (): Promise<{
        canceled: boolean
        filePaths: string[]
      }> => ({ canceled: false, filePaths: [folder] })
      dialog.showOpenDialogSync = (): string[] => [folder]
    }, workspace)
    await command('open folder', folderOption)
    await expect(page).toHaveTitle(new RegExp(basename(workspace), 'u'))
    await toggleLayout()
    process.stdout.write(`Desktop URL: ${page.url()}\n`)
    await page.locator('.Workbench.AiNativeLayout').waitFor()
    await submit(weatherPrompt)
    await complete(1)
    await expect(page.locator('.ChatMessageAssistant')).toContainText('Berlin')
    await expect(page.locator('.ChatMessageAssistant')).toContainText(
      'Sources:',
    )
    await submit('Which city was that forecast for?')
    await complete(1)
    await expect(page.locator('.ChatMessageAssistant').last()).toContainText(
      'Berlin',
    )
    process.stdout.write('desktop weather and follow-up: pass\n')

    await newChat()
    await submit(
      'Fix the obvious arithmetic bug so npm test passes. Use apply_patch for the change and keep the change scoped to the bug.',
    )
    await complete(2)
    assert.match(
      await readFile(join(workspace, 'src/add.js'), 'utf8'),
      addition,
    )
    await expect(page.locator('.ChatChecksPassed')).toContainText(
      'checks passed',
    )
    await expect(page.locator('button[name="revert"]')).toHaveCount(0)
    process.stdout.write(
      'desktop applied edit and agent-run project check: pass\n',
    )

    await control('pause')
    try {
      await newChat()
      await submit(
        'Replace first original in a.txt with first updated. Keep the change scoped to that file.',
      )
      await expect(page.locator('.ChatTaskStatus-running')).toHaveCount(1)
      await newChat()
      await submit(
        'Replace second original in b.txt with second updated. Keep the change scoped to that file.',
      )
      await expect(page.locator('.ChatTaskStatus-running')).toHaveCount(2)
    } finally {
      await control('resume')
    }
    await complete(4)
    assert.equal(
      await readFile(join(workspace, 'a.txt'), 'utf8'),
      'first updated\n',
    )
    assert.equal(
      await readFile(join(workspace, 'b.txt'), 'utf8'),
      'second updated\n',
    )
    process.stdout.write('desktop concurrent conversations: pass\n')

    await newChat()
    await control('pause')
    try {
      await submit(weatherPrompt)
      await expect(page.locator('.ChatTaskStatus-running')).toHaveCount(1)
      await page.locator('button[name="stop"]').click()
      await expect(page.locator('.ChatTaskStatus-stopped')).toHaveCount(1)
      await expect(page.locator('.ChatTaskStatus-running')).toHaveCount(0)
    } finally {
      await control('resume')
    }
    assert.match(
      await readFile(join(workspace, 'src/add.js'), 'utf8'),
      addition,
    )
    const composer = page.locator('textarea[name="composer"]')
    await composer.fill('Preserve this desktop draft')
    await expect(page.locator('button[name="submit"]')).toBeEnabled()
    const hash = URL.parse(page.url())?.hash
    assert.ok(hash)
    await page.reload()
    await page.locator('.Workbench.AiNativeLayout').waitFor()
    await expect(composer).toHaveValue('Preserve this desktop draft')
    await expect(page.locator('.ChatTaskStatus-stopped')).toHaveCount(1)
    assert.equal(URL.parse(page.url())?.hash, hash)
    process.stdout.write('desktop stop, history and draft reload: pass\n')

    await toggleLayout()
    await openFile('src/auth.ts')
    await expect(page.locator('.Editor:visible')).toContainText('disk-token')
    await page.keyboard.press(`${modifier}+A`)
    await page.keyboard.type("export const mechanism = 'session-cookie'\n")
    await expect(page.locator('.Editor:visible')).toContainText(
      'session-cookie',
    )
    await openFile('README.md')
    await toggleLayout()
    await newChat()
    await submit(
      'Find the authentication mechanism in this project without asking me to attach files. Explain how it works and cite the file and line using a clickable Markdown link.',
    )
    await complete(5)
    await expect(page.locator('.ChatMessageAssistant')).toContainText(
      'session-cookie',
    )
    assert.equal(
      await readFile(join(workspace, 'src/auth.ts'), 'utf8'),
      fixtures['src/auth.ts'],
    )
    await page.locator('.ChatFileLink').first().click()
    await expect(page.locator('.Editor:visible')).toContainText(
      'session-cookie',
    )
    assert.deepEqual(errors, [])
    process.stdout.write(
      'desktop inactive unsaved file discovery and source navigation: pass\n',
    )
  } catch (error) {
    let text = 'unavailable'
    try {
      text = await page.locator('body').innerText()
    } catch {
      /* The window may have closed. */
    }
    process.stderr.write(`Desktop state: ${text}\n`)
    throw error
  } finally {
    // The fixture intentionally leaves an unsaved buffer. Exit the isolated app
    // without a save dialog, then let the launcher remove its private profile.
    try {
      await electronApp.evaluate(({ app }) => app.exit(0))
    } catch {
      /* Exit closes the evaluation target. */
    }
  }
}
