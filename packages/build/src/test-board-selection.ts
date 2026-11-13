import assert from 'node:assert/strict'
import type { Browser } from 'playwright'

// Exercise the real static workbench and extension event bridge. Only the
// authenticated backend boundary is mocked; no Trello credentials are used.
export const testBoardSelection = async (
  browser: Browser,
  baseUrl: string,
): Promise<void> => {
  const context = await browser.newContext()
  const backend = 'https://trello-selection.test'
  let empty = false
  let fail = false
  const loaded: string[] = []
  await context.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    assert.equal(route.request().headers().authorization, 'Bearer board-test')
    let body: unknown
    let status = 200
    if (path.endsWith('/status')) {
      body = { configured: true, connected: true }
    } else if (path.endsWith('/boards')) {
      status = fail ? 503 : 200
      body = empty
        ? []
        : [
            { id: '11111111', name: 'Design & research' },
            { id: '22222222', name: 'Engineering' },
          ]
    } else {
      loaded.push(path)
      body = {
        id: '22222222',
        name: 'Engineering',
        lists: [{ id: 'todo', name: 'Todo', pos: 1 }],
        cards: [
          {
            id: 'one',
            idList: 'todo',
            name: 'Discuss design',
            pos: 1,
            badges: { comments: 3, attachments: 1 },
          },
          {
            id: 'two',
            idList: 'todo',
            name: 'No activity',
            pos: 2,
            badges: { comments: 0, attachments: 0 },
          },
          { id: 'three', idList: 'todo', name: 'Older response', pos: 3 },
        ],
      }
    }
    await route.fulfill({ status, json: body })
  })
  try {
    const page = await context.newPage()
    const bootstrap = new URL('__board-test-bootstrap', baseUrl).href
    await context.route(bootstrap, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Board test setup</title>',
      }),
    )
    await page.goto(bootstrap)
    await page.evaluate(async (backendUrl) => {
      localStorage.setItem(
        'settings',
        JSON.stringify({
          'layout.backendUrl': backendUrl,
          'chat2.backendUrl': backendUrl,
          'chat2.useMockBackend': false,
        }),
      )
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('auth-worker', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('auth')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('auth', 'readwrite')
          transaction.objectStore('auth').put(
            JSON.stringify({
              activeId: 'board-test',
              revision: 1,
              accounts: [
                {
                  id: 'board-test',
                  backendUrl,
                  profile: { id: 'board-test', displayName: 'Board test' },
                  session: {
                    userState: 'loggedIn',
                    authAccessToken: 'board-test',
                    authAccessTokenExpiresAt: Date.now() + 3_600_000,
                  },
                },
              ],
            }),
            'accountSessions',
          )
          transaction.oncomplete = () => {
            db.close()
            resolve()
          }
          transaction.onerror = () => reject(transaction.error)
        }
      })
    }, backend)
    await page.goto(baseUrl)
    await page.locator('.Workbench').waitFor()
    await page.getByRole('tab', { name: 'Boards', exact: true }).click()
    await page.locator('button[name="board-provider:trello"]').click()
    const select = page.getByRole('combobox', { name: 'Trello board' })
    await select.waitFor()
    await page.waitForFunction(
      () =>
        !globalThis.document.querySelector('select[name="board-id"]')?.disabled,
    )
    assert.deepEqual(await select.locator('option').allTextContents(), [
      'Select a board',
      'Design & research',
      'Engineering',
    ])
    assert.equal(await page.locator('input[name="board-id"]').count(), 0)
    const open = page.getByRole('button', { name: 'Open board', exact: true })
    assert.equal(await open.isDisabled(), true)
    // End selects the last option in Chromium on Linux/Windows. macOS uses
    // different native menu shortcuts; exercise its select event bridge directly.
    if (process.platform === 'darwin') {
      await select.selectOption({ label: 'Engineering' })
    } else {
      await select.focus()
      await page.keyboard.press('End')
      await page.keyboard.press('Tab')
    }
    await page.waitForFunction(() => {
      const button = globalThis.document.querySelector(
        '.BoardConnect .BoardPrimaryButton',
      )
      return button && !button.disabled
    })
    await open.click()
    await page
      .getByRole('heading', { name: 'Engineering', exact: true })
      .waitFor()
    const badges = page.locator('.BoardCardBadges')
    await badges.waitFor()
    assert.equal(await badges.count(), 1)
    assert.equal(
      await badges
        .getByRole('img', { name: '3 comments', exact: true })
        .textContent(),
      '3',
    )
    assert.equal(
      await badges
        .getByRole('img', { name: '1 attachment', exact: true })
        .textContent(),
      '1',
    )
    assert.equal(await page.locator('.BoardCardBadgeIcon').count(), 2)
    assert.deepEqual(loaded, ['/api/integrations/trello/boards/22222222'])
    await page
      .getByRole('button', { name: 'Connect another board', exact: true })
      .click()
    empty = true
    await page
      .getByRole('button', { name: 'Connect Trello', exact: true })
      .click()
    await page.getByText('No open boards found.', { exact: false }).waitFor()
    assert.equal(await select.isDisabled(), true)
    fail = true
    await page
      .getByRole('button', { name: 'Refresh boards', exact: true })
      .click()
    await page.getByRole('alert').waitFor()
    fail = false
    empty = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.getByRole('alert').waitFor({ state: 'detached' })
    await page.waitForFunction(() => {
      const control = globalThis.document.querySelector(
        'select[name="board-id"]',
      )
      return control && !control.disabled && control.options.length === 3
    })
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(await select.isEnabled(), true)
    await page.setViewportSize({ width: 390, height: 844 })
    if (process.env.BOARD_SELECTION_SCREENSHOT)
      await page.screenshot({ path: process.env.BOARD_SELECTION_SCREENSHOT })
    const box = await select.boundingBox()
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= 390,
      'Board selector fits a narrow viewport',
    )
    process.stdout.write(
      'static Trello discovery, native selection, empty state and retry: pass\n',
    )
  } finally {
    await context.close()
  }
}
