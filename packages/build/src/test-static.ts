import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFile } from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, firefox } from 'playwright'
import { testBoardSelection } from './test-board-selection.ts'
import { testComposerPaste } from './test-composer-paste.ts'
import { testLayoutTransition } from './test-layout-transition.ts'
import {
  startEvaluationProxy,
  type EvaluationProxy,
} from '../../evaluation/src/Proxy.ts'

const root = fileURLToPath(new URL('../../../dist/', import.meta.url))
const prefix = '/chat-view-2/'
const recording = process.argv.includes('--record')
if (recording) {
  try {
    loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
const transcriptPath = fileURLToPath(
  new URL('../../evaluation/results/static-ui.json', import.meta.url),
)
const responseCount = async (): Promise<number> => {
  try {
    return (
      JSON.parse(await readFile(transcriptPath, 'utf8')) as {
        exchanges: readonly unknown[]
      }
    ).exchanges.length
  } catch {
    return 0
  }
}
const mimeTypes: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}
const server = createServer((request, response) => {
  void serve(request, response)
})

async function serve(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = request.url || '/'
    assert.ok(URL.canParse(url, 'http://localhost'))
    const pathname = decodeURIComponent(
      new URL(url, 'http://localhost').pathname,
    )
    assert.ok(pathname.startsWith(prefix))
    const file = resolve(root, pathname.slice(prefix.length))
    assert.ok(
      file === resolve(root) ||
        file.startsWith(root.endsWith(sep) ? root : root + sep),
    )
    const target = extname(file) ? file : join(file, 'index.html')
    const content = await readFile(target)
    const parsedUrl = new URL(url, 'http://localhost')
    if (!extname(file) && !pathname.endsWith('/')) {
      response.writeHead(301, {
        Location: `${pathname}/${parsedUrl.search}`,
      })
      response.end()
      return
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(target)] || 'application/octet-stream',
    })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end()
  }
}

await new Promise<void>((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
let replay: EvaluationProxy | undefined
try {
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl =
    process.env.STATIC_TEST_BASE_URL ||
    `http://127.0.0.1:${address.port}${prefix}`
  assert.ok(URL.canParse(baseUrl))
  const origin = new URL(baseUrl).origin
  const layoutTransitionOnly = process.argv.includes('--layout-transition-only')
  const boardSelectionOnly = process.argv.includes('--board-selection-only')
  replay = await startEvaluationProxy({
    cacheDirectory: fileURLToPath(
      new URL('../../evaluation/cache/', import.meta.url),
    ),
    mode: recording ? 'record' : 'replay',
    ...(recording &&
      process.env.LVCE_ACCESS_TOKEN && {
        apiKey: process.env.LVCE_ACCESS_TOKEN,
      }),
    model: 'gpt-5.4-mini',
    port: boardSelectionOnly || layoutTransitionOnly ? 0 : 8787,
    workspaceUri: 'memfs:///recorded-workspace/',
    allowedOrigin: origin,
    scenarioId: 'static-ui',
    enableControls: true,
    transcriptPath,
    upstreamBaseUrl:
      process.env.EVALUATION_UPSTREAM_URL || 'http://127.0.0.1:1/api/v1',
  })
  const browserType = process.argv.includes('--firefox') ? firefox : chromium
  const browser = await browserType.launch({ headless: true })
  const testExported = async (evaluation: EvaluationProxy): Promise<void> => {
    await testBoardSelection(browser, baseUrl)
    const startup = await browser.newContext()
    const startupPage = await startup.newPage()
    try {
      const page = startupPage
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') {
          console.error(message.text())
        }
      })
      await page.goto(baseUrl)
      await page.locator('.ActivityBar').waitFor()
      await page.keyboard.press('Control+Shift+P')
      await page.getByRole('combobox').fill('>toggle ai')
      await page
        .getByRole('option', {
          name: 'View: Toggle AI-Native / IDE Layout',
          exact: true,
        })
        .click()
      await page.locator('.Workbench.AiNativeLayout').waitFor()
      await page.locator('.ChatLoggedOut').waitFor()
      await page.reload()
      await page.locator('.Workbench.AiNativeLayout').waitFor()
      await page.locator('.ChatLoggedOut').waitFor()
      assert.deepEqual(
        errors,
        [],
        'Cold startup or direct chat reload raised an exception',
      )
      process.stdout.write('cold startup and signed-out chat reload: pass\n')
    } catch (error) {
      console.error(
        'Startup state:',
        await startupPage.locator('body').innerText(),
      )
      throw error
    } finally {
      await startup.close()
    }
    const direct = await browser.newContext()
    const directPage = await direct.newPage()
    const directErrors: string[] = []
    directPage.on('pageerror', (error) => directErrors.push(error.message))
    try {
      const page = directPage
      await page.goto(`${baseUrl}chat/`)
      await page.locator('.Workbench.AiNativeLayout').waitFor()
      await page.locator('.ChatLoggedOut').waitFor()
      const activityBar = page.locator('.ActivityBarLayout')
      const toggleActivityBar = async (): Promise<void> => {
        await page.keyboard.press('F1')
        await page
          .locator('.QuickPick input')
          .fill('>Layout: Toggle Activity Bar')
        await page
          .locator('.QuickPickItem')
          .filter({ hasText: 'Layout: Toggle Activity Bar' })
          .click()
      }
      for (let index = 0; index < 2; index++) {
        await toggleActivityBar()
        await activityBar.waitFor({ state: 'hidden' })
        await toggleActivityBar()
        await activityBar.waitFor()
        await activityBar
          .getByRole('button', { name: 'Settings', exact: true })
          .waitFor()
        assert.equal(await activityBar.getByRole('tab').count(), 0)
        await page.locator('.Workbench.AiNativeLayout').waitFor()
      }
      assert.deepEqual(
        directErrors,
        [],
        'Fresh direct chat raised an exception',
      )
      process.stdout.write('fresh direct chat route: pass\n')
    } catch (error) {
      console.error(
        'Direct route state:',
        await directPage.locator('body').innerText(),
        directErrors,
      )
      throw error
    } finally {
      await direct.close()
    }
    const savedIdeLayout = await browser.newContext()
    const savedIdePage = await savedIdeLayout.newPage()
    try {
      await savedIdePage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
      await savedIdePage.evaluate(
        'localStorage.setItem("Layout", JSON.stringify({ aiNativeLayout: false }))',
      )
      await savedIdePage.goto(`${baseUrl}chat/`, {
        waitUntil: 'domcontentloaded',
      })
      const startupClass = await savedIdePage.evaluate(
        'document.documentElement.classList.contains("AiNativeLayoutStartup")',
      )
      const startupBackground = await savedIdePage.evaluate(
        'getComputedStyle(document.documentElement).backgroundColor',
      )
      assert.equal(
        startupClass,
        true,
        'direct chat with a saved IDE layout did not apply the startup surface',
      )
      assert.equal(
        startupBackground,
        'rgb(255, 255, 255)',
        'direct chat with a saved IDE layout used the dark startup surface',
      )
      await savedIdePage.locator('.ChatLoggedOut').waitFor()
      process.stdout.write(
        'direct chat uses a light startup surface with saved IDE layout: pass\n',
      )
    } catch (error) {
      console.error(
        'Saved IDE layout startup state:',
        await savedIdePage.locator('body').innerText(),
        await savedIdePage.evaluate(
          'JSON.stringify({pathname: location.pathname, layout: localStorage.getItem("Layout"), rootClass: document.documentElement.className, background: getComputedStyle(document.documentElement).backgroundColor})',
        ),
      )
      throw error
    } finally {
      await savedIdeLayout.close()
    }
    const board = await browser.newContext()
    const boardPage = await board.newPage()
    const boardErrors: string[] = []
    boardPage.on('pageerror', (error) => boardErrors.push(error.message))
    try {
      const response = await boardPage.goto(`${baseUrl}board`)
      assert.equal(response?.status(), 200)
      await boardPage.locator('.BoardView').waitFor()
      await boardPage
        .getByRole('heading', { name: 'Boards', exact: true })
        .waitFor()
      assert.ok(new URL(boardPage.url()).pathname.endsWith('/board/'))
      const reloadResponse = await boardPage.reload()
      assert.equal(reloadResponse?.status(), 200)
      await boardPage.locator('.BoardView').waitFor()
      await boardPage
        .getByRole('heading', { name: 'Boards', exact: true })
        .waitFor()
      assert.ok(new URL(boardPage.url()).pathname.endsWith('/board/'))
      await boardPage.goto(`${baseUrl}board/`)
      await boardPage.locator('.BoardView').waitFor()
      await boardPage
        .getByRole('heading', { name: 'Boards', exact: true })
        .waitFor()
      assert.ok(new URL(boardPage.url()).pathname.endsWith('/board/'))
      assert.deepEqual(
        boardErrors,
        [],
        'Direct board load or reload raised an exception',
      )
      process.stdout.write('fresh direct board route and reload: pass\n')
    } catch (error) {
      console.error(
        'Direct board route state:',
        boardPage.url(),
        (await boardPage.locator('body').innerText()).slice(0, 5000),
        boardErrors,
      )
      throw error
    } finally {
      await board.close()
    }
    for (const preserveStartupFocus of [false, true]) {
      const context = await browser.newContext()
      await context.addInitScript((preserveFocus) => {
        localStorage.setItem(
          'settings',
          JSON.stringify({ 'chat2.useMockBackend': true }),
        )
        if (preserveFocus) {
          globalThis.document.addEventListener('DOMContentLoaded', () => {
            const control = globalThis.document.createElement('input')
            control.id = 'startup-focus-control'
            globalThis.document.body.append(control)
            control.focus()
          })
        }
      }, preserveStartupFocus)
      try {
        const page = await context.newPage()
        await page.goto(`${baseUrl}chat/`)
        const composer = page.locator('textarea[name="composer"]')
        await composer.waitFor()
        await page.locator('.Workbench.AiNativeLayout').waitFor()
        if (preserveStartupFocus) {
          await page.waitForFunction(
            () =>
              globalThis.document.activeElement?.id === 'startup-focus-control',
          )
          await page.keyboard.type('Keep my startup focus')
          assert.equal(
            await page.locator('#startup-focus-control').inputValue(),
            'Keep my startup focus',
          )
          assert.equal(await composer.inputValue(), '')
        } else {
          await page.waitForFunction(
            () =>
              globalThis.document.activeElement?.getAttribute('name') ===
              'composer',
          )
          await page.keyboard.type('Type without clicking')
          await page.waitForFunction(
            (value) =>
              globalThis.document.querySelector('textarea[name="composer"]')
                ?.value === value,
            'Type without clicking',
          )
          assert.equal(await composer.inputValue(), 'Type without clicking')
          await page.reload()
          await composer.waitFor()
          await page.waitForFunction(
            () =>
              globalThis.document.activeElement?.getAttribute('name') ===
              'composer',
          )
          await page.keyboard.press('ControlOrMeta+A')
          await page.keyboard.type('Type immediately after reload')
          await page.waitForFunction(
            (value) =>
              globalThis.document.querySelector('textarea[name="composer"]')
                ?.value === value,
            'Type immediately after reload',
          )
          assert.equal(
            await composer.inputValue(),
            'Type immediately after reload',
          )
          const control = page.locator('button[name="new-task"]')
          await control.focus()
          await page.evaluate(() =>
            globalThis.dispatchEvent(new Event('resize')),
          )
          assert.equal(
            await control.evaluate(
              (element) => globalThis.document.activeElement === element,
            ),
            true,
          )
        }
        if (!preserveStartupFocus) {
          await page.locator('button[name="new-task"]').click()
          await page.waitForFunction(
            () =>
              globalThis.document.querySelector('textarea[name="composer"]')
                ?.value === '',
          )
          await page.waitForFunction(
            () =>
              globalThis.document.activeElement?.getAttribute('name') ===
              'composer',
          )
          await page.keyboard.type('New draft after clearing')
          await page.waitForFunction(
            (value) =>
              globalThis.document.querySelector('textarea[name="composer"]')
                ?.value === value,
            'New draft after clearing',
          )
          assert.equal(await composer.inputValue(), 'New draft after clearing')
        }
        process.stdout.write(
          `Direct chat ${preserveStartupFocus ? 'preserves startup focus' : 'focuses composer on load and reload'}: pass\n`,
        )
      } finally {
        await context.close()
      }
    }
    const files = await readdir(join(root, 'tests'))
    const tests = files
      .filter(
        (file) =>
          file.endsWith('.html') &&
          file !== '_all.html' &&
          file !== 'index.html' &&
          (!process.env.STATIC_TEST_FILTER ||
            file.includes(process.env.STATIC_TEST_FILTER)),
      )
      .toSorted((a, b) => a.localeCompare(b))
    assert.ok(tests.length > 0, 'No exported tests found')
    const index = await browser.newPage()
    try {
      const response = await index.goto(`${baseUrl}tests/index.html`)
      assert.equal(response?.status(), 200)
      for (const test of tests) {
        assert.equal(await index.locator(`a[href="./${test}"]`).count(), 1)
      }
    } finally {
      await index.close()
    }
    const failures: string[] = []
    for (const test of tests) {
      const context = await browser.newContext()
      // Hosted acceptance reaches the loopback replay server from HTTPS.
      // Grant Chromium's permission only to this test context and site.
      if (new URL(baseUrl).protocol === 'https:') {
        await context.grantPermissions(['local-network-access'], { origin })
      }
      const externalRequests: string[] = []
      // Exported tests must use the deterministic backend without credentials.
      await context.route('**/*', async (route) => {
        const url = route.request().url()
        if (
          new URL(url).origin !== origin &&
          new URL(url).origin !== evaluation.origin
        ) {
          externalRequests.push(url)
          await route.abort()
          return
        }
        await route.continue()
      })
      try {
        const page = await context.newPage()
        await page.goto(`${baseUrl}tests/${test}`)
        const overlay = page.locator('#TestOverlay')
        await overlay.waitFor({ timeout: 60_000 })
        const state = await overlay.getAttribute('data-state')
        const text = await overlay.textContent()
        assert.notEqual(state, 'fail', text || test)
        assert.ok(
          ['pass', 'skip'].includes(state || ''),
          `Unknown result: ${state}`,
        )
        assert.deepEqual(externalRequests, [], 'Unexpected external requests')
        if (test === 'chat2.recorded.weather.html' && state === 'pass') {
          // Test application preferences are scoped to that application. Keep
          // the same replay boundary when navigating to the normal workbench.
          await page.evaluate((backendUrl) => {
            const settings = JSON.parse(
              globalThis.localStorage.getItem('settings') || '{}',
            )
            globalThis.localStorage.setItem(
              'settings',
              JSON.stringify({
                ...settings,
                'chat2.backendUrl': backendUrl,
                'chat2.computerUseEnabled': false,
                'chat2.selectedModelId': 'gpt-5.4-mini',
                'chat2.responseMethod': 'websocket',
                'chat2.useMockBackend': false,
              }),
            )
          }, evaluation.origin)
          const composer = page.locator('textarea[name="composer"]')
          await composer.fill('Preserve this draft across a real reload')
          await page.locator('button[name="submit"]:not([disabled])').waitFor()
          const messages = (
            await page
              .locator('.ChatMessageUser, .ChatMessageAssistant')
              .allTextContents()
          ).map((message) =>
            message.replace(
              /(?:\d+ (?:seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago|in \d+ (?:seconds?|minutes?|hours?|days?|weeks?|months?|years?))$/u,
              '',
            ),
          )
          const hash = new URL(page.url()).hash
          process.stdout.write(
            `Static conversation before reload: ${page.url()}\n`,
          )
          await page.reload()
          process.stdout.write(
            `Static conversation after reload: ${page.url()}\n`,
          )
          await page.locator('.Workbench.AiNativeLayout').waitFor()
          await composer.waitFor()
          assert.equal(
            await composer.inputValue(),
            'Preserve this draft across a real reload',
          )
          assert.equal(new URL(page.url()).hash, hash)
          assert.deepEqual(
            (
              await page
                .locator('.ChatMessageUser, .ChatMessageAssistant')
                .allTextContents()
            ).map((message) =>
              message.replace(
                /(?:\d+ (?:seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago|in \d+ (?:seconds?|minutes?|hours?|days?|weeks?|months?|years?))$/u,
                '',
              ),
            ),
            messages,
          )
          process.stdout.write(
            'conversation and draft survive a real reload: pass\n',
          )
          await page.locator('button[name="new-task"]').click()
          await page
            .locator('.ChatMessageUser')
            .first()
            .waitFor({ state: 'detached' })
          await page
            .locator('.ChatMessageAssistant')
            .first()
            .waitFor({ state: 'detached' })
          await fetch(`${evaluation.origin}/__replay/pause`, { method: 'POST' })
          const before = await responseCount()
          await composer.fill(
            'What is the weather forecast for Berlin, Germany on November 4, 2026? Use web search and cite your sources.',
          )
          await page.locator('button[name="submit"]:not([disabled])').click()
          await page.locator('.ChatTaskStatus-running').waitFor()
          const deadline = Date.now() + 10_000
          while ((await responseCount()) < before + 2) {
            assert.ok(
              Date.now() < deadline,
              'The pending turn did not reach the replay boundary',
            )
            await delay(50)
          }
          const pending = await responseCount()
          await page.reload()
          await page.locator('.ChatTaskStatus-interrupted').waitFor()
          assert.equal(await page.locator('.ChatMessageUser').count(), 1)
          assert.equal(
            await responseCount(),
            pending,
            'Reload resubmitted an interrupted response',
          )
          await fetch(`${evaluation.origin}/__replay/resume`, {
            method: 'POST',
          })
          await composer.fill('Continue with the forecast.')
          await page.locator('button[name="submit"]:not([disabled])').click()
          await page
            .locator('.ChatMessageAssistant')
            .last()
            .filter({ hasText: /Berlin/u })
            .waitFor({ timeout: 120_000 })
          assert.equal(
            await page
              .locator('.ChatTaskStatus-failed, .ChatError, .ChatErrorBanner')
              .count(),
            0,
          )
          assert.match(
            await page.locator('.ChatMessageAssistant').last().innerText(),
            /Berlin/u,
          )
          process.stdout.write(
            'running reload preserves history and requires explicit continuation: pass\n',
          )
        }
        process.stdout.write(`${test}: ${state}\n`)
      } catch (error) {
        failures.push(`${test}: ${String(error)}`)
        console.error(failures.at(-1))
        const page = context.pages()[0]
        if (page)
          console.error(
            'Static failure state:',
            page.url(),
            (await page.locator('body').innerText()).slice(0, 5000),
          )
      } finally {
        await context.close()
      }
    }
    assert.deepEqual(failures, [], 'Exported e2e tests failed')
  }
  try {
    if (layoutTransitionOnly) {
      await testLayoutTransition(browser, baseUrl)
    } else if (boardSelectionOnly) {
      await testBoardSelection(browser, baseUrl)
    } else {
      await testComposerPaste(browser, baseUrl)
    }
    if (
      !boardSelectionOnly &&
      !layoutTransitionOnly &&
      !process.argv.includes('--paste-only')
    ) {
      await testLayoutTransition(browser, baseUrl)
      await testExported(replay)
    }
  } finally {
    await browser.close()
  }
} finally {
  await replay?.close()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
