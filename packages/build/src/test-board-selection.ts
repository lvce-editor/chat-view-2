// cspell:words prefs

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
  const discoveryLoads: string[] = []
  const directLoads: string[] = []
  const proxiedLoads: string[] = []
  const coverLoads: string[] = []
  const moveRequests: string[] = []
  await context.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    assert.equal(route.request().headers().authorization, 'Bearer board-test')
    let body: unknown
    let status = 200
    if (route.request().method() === 'PUT') {
      moveRequests.push(path)
      body = {}
    } else if (path.endsWith('/status')) {
      body = { configured: true, connected: true }
    } else if (path.endsWith('/token')) {
      body = { accessToken: 'trello-test' }
    } else {
      proxiedLoads.push(path)
      status = 500
      body = { error: 'Board content must be requested directly from Trello.' }
    }
    await route.fulfill({ status, json: body })
  })
  await context.route('https://api.trello.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Headers': 'authorization',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Origin': '*',
        },
      })
      return
    }
    assert.equal(request.headers().authorization, 'Bearer trello-test')
    const url = new URL(request.url())
    if (url.pathname === '/1/search') {
      await route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: {
          boards: [{ id: '22222222', name: 'Engineering' }],
          cards: [
            {
              id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
              idBoard: '22222222',
              name: 'Card with cover',
            },
          ],
        },
      })
      return
    }
    if (url.pathname === '/1/members/me/boards') {
      discoveryLoads.push(`${url.pathname}${url.search}`)
      await route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        status: fail ? 503 : 200,
        json: empty
          ? []
          : [
              {
                id: '11111111',
                name: 'Design & research',
                prefs: { backgroundColor: '#22a06b' },
              },
              {
                id: '22222222',
                name: 'Engineering',
                prefs: {
                  backgroundImage:
                    'https://trello-backgrounds.s3.amazonaws.com/engineering.jpg',
                },
              },
              {
                id: '33333333',
                name: 'Long board name with a gradient background',
                prefs: {
                  backgroundBottomColor: '#8b4dc8',
                  backgroundTopColor: '#0c66e4',
                },
              },
            ],
      })
      return
    }
    if (url.pathname === '/1/cards/aaaaaaaaaaaaaaaaaaaaaaaa') {
      await route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: {
          desc: 'A detailed description from Trello.',
          attachments: [
            { name: 'design.png', url: 'https://example.com/design.png' },
          ],
          actions: [
            {
              type: 'commentCard',
              date: '2026-11-16T12:00:00.000Z',
              memberCreator: { fullName: 'Board member' },
              data: { text: 'Please review the attached design.' },
            },
            {
              type: 'createCard',
              date: '2026-11-15T12:00:00.000Z',
              memberCreator: { fullName: 'Board member' },
              data: {},
            },
          ],
        },
      })
      return
    }
    directLoads.push(`${url.pathname}${url.search}`)
    const id = url.pathname.split('/').at(-1)
    await route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: {
        id,
        name: 'Engineering',
        prefs:
          id === '22222222'
            ? {
                backgroundImage:
                  'https://trello-backgrounds.s3.amazonaws.com/engineering.jpg',
              }
            : {
                backgroundBottomColor: '#ff58b0',
                backgroundTopColor: '#a82be0',
              },
        lists: [
          { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Todo', pos: 1 },
          { id: 'cccccccccccccccccccccccc', name: 'Doing', pos: 2 },
        ],
        cards: [
          {
            cover: {
              scaled: [
                {
                  url: 'https://trello.com/1/cards/aaaaaaaaaaaaaaaaaaaaaaaa/previews/card-cover',
                  width: 300,
                },
              ],
            },
            id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            idList: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            name: 'Card with cover',
            pos: 1,
            badges: { comments: 3, attachments: 1 },
          },
          {
            id: 'card-2',
            idList: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            name: 'No activity',
            pos: 2,
            badges: { comments: 0, attachments: 0 },
          },
        ],
      },
    })
  })
  await context.route('https://trello.com/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Headers': 'authorization',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Origin': '*',
        },
      })
      return
    }
    assert.equal(request.headers().authorization, 'Bearer trello-test')
    coverLoads.push(request.url())
    await route.fulfill({
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmL8AAAAASUVORK5CYII=',
        'base64',
      ),
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'image/png',
      },
    })
  })
  try {
    const page = await context.newPage()
    const openBoardOptions = async (): Promise<void> => {
      await page
        .getByRole('button', { name: 'More board options', exact: true })
        .click()
    }
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
    await page.keyboard.press('Control+Shift+P')
    await page.getByRole('combobox').fill('>Open Board Layout')
    await page
      .getByRole('option', { name: 'View: Open Board Layout', exact: true })
      .click()
    const tiles = page.locator('.BoardTile')
    await page.getByRole('button', { name: 'Open Engineering' }).waitFor()
    assert.equal(
      await page.locator('button[name="board-provider:trello"]').count(),
      0,
    )
    assert.equal(await tiles.count(), 3)
    assert.deepEqual(await page.locator('.BoardTileName').allTextContents(), [
      'Design & research',
      'Engineering',
      'Long board name with a gradient background',
    ])
    assert.equal(
      await page
        .locator('.BoardTileBackground')
        .nth(0)
        .evaluate((element) => element.style.backgroundColor),
      'rgb(34, 160, 107)',
    )
    assert.equal(
      await page.locator('.BoardTileImage').getAttribute('src'),
      'https://trello-backgrounds.s3.amazonaws.com/engineering.jpg',
    )
    assert.equal(
      await page
        .locator('.BoardTileBackground')
        .nth(2)
        .evaluate((element) => element.style.backgroundImage),
      'linear-gradient(135deg, rgb(12, 102, 228), rgb(139, 77, 200))',
    )
    const boardSearch = page.getByRole('searchbox', { name: 'Search boards' })
    await boardSearch.fill('cover')
    await page
      .getByRole('button', { name: 'Card · Card with cover — Engineering' })
      .waitFor()
    assert.equal(await page.locator('.BoardSearchResult').count(), 2)
    await boardSearch.fill('')
    assert.equal(discoveryLoads.length, 1)
    await page.getByRole('button', { name: 'Open Engineering' }).click()
    await page
      .getByRole('heading', { name: 'Engineering', exact: true })
      .waitFor()
    assert.equal(new URL(page.url()).hash, '#22222222')
    assert.deepEqual(directLoads, [
      '/1/boards/22222222?card_fields=name%2CidList%2Cpos%2Ccover&cards=open&fields=name%2Cprefs&list_fields=name%2Cpos&lists=open',
    ])
    assert.equal(
      await page.locator('.BoardViewTrello').evaluate(
        (element) =>
          (
            element as unknown as {
              style: { backgroundImage: string }
            }
          ).style.backgroundImage,
      ),
      'url("https://trello-backgrounds.s3.amazonaws.com/engineering.jpg")',
    )
    await page.reload()
    await page
      .getByRole('heading', { name: 'Engineering', exact: true })
      .waitFor()
    assert.equal(new URL(page.url()).hash, '#22222222')
    assert.equal(directLoads.length, 2)
    assert.deepEqual(proxiedLoads, [])
    const cover = page.locator('.BoardCardCover')
    await cover.waitFor({ state: 'visible' })
    const coverSrc = await cover.getAttribute('src')
    assert.ok(coverSrc)
    assert.match(coverSrc, /^data:image\/png;base64,/u)
    assert.deepEqual(coverLoads, [
      'https://trello.com/1/cards/aaaaaaaaaaaaaaaaaaaaaaaa/previews/card-cover',
      'https://trello.com/1/cards/aaaaaaaaaaaaaaaaaaaaaaaa/previews/card-cover',
    ])
    await page.getByText('Card with cover', { exact: true }).waitFor()
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
    await page
      .getByRole('button', { name: 'Card with cover', exact: false })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Edit Trello card' })
    await dialog
      .getByText('Please review the attached design.', { exact: true })
      .waitFor()
    assert.equal(await dialog.getByLabel('Status: Todo').textContent(), 'Todo')
    assert.equal(
      await dialog
        .getByRole('textbox', { name: 'Description', exact: true })
        .inputValue(),
      'A detailed description from Trello.',
    )
    assert.equal(
      await dialog
        .getByRole('link', { name: 'design.png' })
        .getAttribute('href'),
      'https://example.com/design.png',
    )
    await dialog.getByText('Created this card', { exact: true }).waitFor()
    const dialogBox = await page.locator('.BoardDialog').boundingBox()
    assert.ok(
      dialogBox && dialogBox.width > 900,
      'Card detail uses the full board layout',
    )
    const main = await page.locator('.BoardDialogMain').boundingBox()
    const activity = await page.locator('.BoardDialogActivity').boundingBox()
    assert.ok(
      main && activity && activity.x >= main.x + main.width - 1,
      'Activity is right of description and attachments',
    )
    assert.equal(
      await dialog.evaluate(
        (element) => globalThis.getComputedStyle(element).backgroundColor,
      ),
      'rgba(0, 0, 0, 0.45)',
    )
    if (process.env.BOARD_DETAIL_SCREENSHOT)
      await page.screenshot({ path: process.env.BOARD_DETAIL_SCREENSHOT })
    await page.setViewportSize({ width: 390, height: 844 })
    const narrowMain = await page.locator('.BoardDialogMain').boundingBox()
    const narrowActivity = await page
      .locator('.BoardDialogActivity')
      .boundingBox()
    assert.ok(
      narrowMain &&
        narrowActivity &&
        narrowActivity.y >= narrowMain.y + narrowMain.height - 1,
      'Activity stacks below details on mobile',
    )
    const panel = await page.locator('.BoardDialog').boundingBox()
    assert.ok(
      panel && panel.x >= 0 && panel.x + panel.width <= 390,
      'Card detail fits mobile',
    )
    if (process.env.BOARD_DETAIL_MOBILE_SCREENSHOT)
      await page.screenshot({
        path: process.env.BOARD_DETAIL_MOBILE_SCREENSHOT,
      })
    await dialog
      .getByRole('button', { name: 'Close card', exact: true })
      .click()
    await dialog.waitFor({ state: 'detached' })
    await page.setViewportSize({ width: 1280, height: 720 })
    await page
      .getByRole('button', { name: 'Card with cover', exact: false })
      .click()
    await dialog.waitFor()
    await page.waitForFunction(
      () =>
        globalThis.document.activeElement?.getAttribute('role') === 'dialog',
    )
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    const draggedCard = page.locator(
      'button[name="board-card:aaaaaaaaaaaaaaaaaaaaaaaa"]',
    )
    const emptyList = page.locator('.BoardCards').nth(1)
    const dragCardToList = async (): Promise<void> => {
      const cardBox = await draggedCard.boundingBox()
      const listBox = await emptyList.boundingBox()
      assert.ok(cardBox && listBox, 'Card and destination list are visible')
      await page.mouse.move(
        cardBox.x + cardBox.width / 2,
        cardBox.y + cardBox.height / 2,
      )
      await page.mouse.down()
      await page.mouse.move(
        cardBox.x + cardBox.width / 2 + 20,
        cardBox.y + cardBox.height / 2,
        { steps: 3 },
      )
      await page.mouse.move(
        listBox.x + listBox.width / 2,
        listBox.y + listBox.height / 2,
        { steps: 5 },
      )
    }
    for (let index = 0; index < 2; index++) {
      await dragCardToList()
      await page.locator('.BoardCardsDropTarget').waitFor()
      assert.equal(
        await draggedCard.evaluate((element) =>
          element.className.includes('BoardCardDragging'),
        ),
        true,
      )
      await page.keyboard.press('Escape')
      await page.locator('.BoardCardsDropTarget').waitFor({ state: 'detached' })
      await page.mouse.up()
      assert.equal(
        await draggedCard.evaluate((element) =>
          element.className.includes('BoardCardDragging'),
        ),
        false,
      )
    }
    await dragCardToList()
    await page.locator('.BoardCardsDropTarget').waitFor()
    await page.mouse.move(5, 5)
    await page.mouse.up()
    await page.locator('.BoardCardsDropTarget').waitFor({ state: 'detached' })
    assert.deepEqual(moveRequests, [])
    assert.equal(
      await page.locator('.BoardCards').first().locator(draggedCard).count(),
      1,
    )
    await dragCardToList()
    await page.locator('.BoardCardsDropTarget').waitFor()
    const moved = page.waitForResponse(
      (response) => response.request().method() === 'PUT',
    )
    await page.mouse.up()
    await moved
    await page.locator('.BoardCardsDropTarget').waitFor({ state: 'detached' })
    assert.equal(await emptyList.locator(draggedCard).count(), 1)
    assert.deepEqual(moveRequests, [
      '/api/integrations/trello/cards/aaaaaaaaaaaaaaaaaaaaaaaa/list/cccccccccccccccccccccccc',
    ])
    process.stdout.write(
      'Card details: status, attachments, comments/activity, desktop/mobile, dismissal and drag cancellation: pass\n',
    )
    const title = page.getByRole('textbox', { name: 'Card title', exact: true })
    for (const list of ['Todo', 'Doing', 'Todo']) {
      await page.getByRole('button', { name: `Add a card to ${list}` }).click()
      await title.waitFor()
      await page.waitForFunction(
        () =>
          globalThis.document.activeElement?.getAttribute('name') ===
          'board-card-title',
        undefined,
        { timeout: 3000 },
      )
      await page.keyboard.press('N')
      await page.waitForFunction(
        (value) =>
          globalThis.document.querySelector('input[name="board-card-title"]')
            ?.value === value,
        'N',
      )
      assert.equal(await title.inputValue(), 'N')
      // An ordinary rerender must not take focus back from another control.
      const refreshButton = page.getByRole('button', {
        name: 'Refresh board',
        exact: true,
      })
      await openBoardOptions()
      const refreshed = page.waitForResponse((response) =>
        response.url().startsWith('https://api.trello.com/1/boards/22222222?'),
      )
      await refreshButton.click()
      await refreshed
      await page
        .getByRole('button', { name: 'More board options', exact: true })
        .waitFor({ state: 'visible' })
      await openBoardOptions()
      await page.waitForFunction(() => {
        const button = globalThis.document.querySelector(
          'button[name="board-refresh"]',
        )
        return button && !button.disabled
      })
      assert.equal(
        await title.evaluate(
          (element) => globalThis.document.activeElement === element,
        ),
        false,
      )
      assert.equal(await title.inputValue(), 'N')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await title.waitFor({ state: 'detached' })
    }
    process.stdout.write('Add card focuses title on open and reopen: pass\n')
    await openBoardOptions()
    const refresh = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().startsWith('https://api.trello.com/1/boards/22222222?'),
    )
    await page
      .getByRole('button', { name: 'Refresh board', exact: true })
      .click()
    await refresh
    assert.equal(directLoads.length, 6)
    assert.deepEqual(proxiedLoads, [])
    await openBoardOptions()
    await page
      .getByRole('button', { name: 'Connect another board', exact: true })
      .click()
    empty = true
    await page
      .getByRole('button', { name: 'Connect Trello', exact: true })
      .click()
    await page.getByText('No open boards found.', { exact: false }).waitFor()
    assert.equal(
      await page.locator('button[name="board-select:22222222"]').innerText(),
      '22222222',
    )
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
      return globalThis.document.querySelectorAll('.BoardTile').length === 3
    })
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(await page.locator('.BoardTile').count(), 3)
    await page.setViewportSize({ width: 390, height: 844 })
    if (process.env.BOARD_SELECTION_SCREENSHOT)
      await page.screenshot({ path: process.env.BOARD_SELECTION_SCREENSHOT })
    const box = await page.locator('.BoardTileGrid').boundingBox()
    assert.ok(
      box && box.x >= 0 && box.x + box.width <= 390,
      'Board selector fits a narrow viewport',
    )
    await page
      .getByRole('button', {
        name: 'Open Long board name with a gradient background',
      })
      .click()
    await page
      .getByRole('heading', { name: 'Engineering', exact: true })
      .waitFor()
    assert.equal(
      await page.locator('.BoardViewTrello').evaluate(
        (element) =>
          (
            element as unknown as {
              style: { backgroundImage: string }
            }
          ).style.backgroundImage,
      ),
      'linear-gradient(135deg, rgb(168, 43, 224), rgb(255, 88, 176))',
    )
    assert.equal(
      await page.locator('.BoardViewTrello').evaluate(
        (element) =>
          (
            element as unknown as {
              style: { backgroundColor: string }
            }
          ).style.backgroundColor,
      ),
      'rgb(255, 88, 176)',
    )
    process.stdout.write(
      'static Trello discovery, clickable board tiles, empty state and retry: pass\n',
    )
  } finally {
    await context.close()
  }
}
