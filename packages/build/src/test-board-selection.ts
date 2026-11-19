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
  await context.route('https://example.com/description.png', (route) =>
    route.fulfill({ body: '', contentType: 'image/png' }),
  )
  let empty = false
  let fail = false
  const discoveryLoads: string[] = []
  const proxiedLoads: string[] = []
  const boardLoads: string[] = []
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
    } else if (
      /^\/api\/integrations\/trello\/boards\/[^/]+\/covers$/u.test(path)
    ) {
      coverLoads.push(path)
      body = [
        {
          coverDataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmL8AAAAASUVORK5CYII=',
          id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ]
    } else if (/^\/api\/integrations\/trello\/boards\/[^/]+$/u.test(path)) {
      boardLoads.push(path)
      const id = path.split('/').at(-1)
      body = {
        id,
        name: 'Engineering',
        prefs:
          id === '33333333'
            ? {
                backgroundBottomColor: '#ff58b0',
                backgroundTopColor: '#a82be0',
              }
            : {
                backgroundImage:
                  'https://trello-backgrounds.s3.amazonaws.com/engineering.jpg',
              },
        lists: [
          { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'Todo', pos: 1 },
          { id: 'cccccccccccccccccccccccc', name: 'Doing', pos: 2 },
          { id: 'dddddddddddddddddddddddd', name: 'Done', pos: 3 },
        ],
        cards: [
          {
            id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            idList: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            labels: [
              { color: 'yellow', id: 'yellow-label', name: 'In progress' },
              { color: 'red', id: 'red-label', name: 'Urgent' },
            ],
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
          ...Array.from({ length: 20 }, (_, index) => ({
            id: `long-list-card-${index}`,
            idList: 'dddddddddddddddddddddddd',
            name: `Long list card ${index}`,
            pos: index + 1,
            badges: { comments: 0, attachments: 0 },
          })),
        ],
      }
    } else {
      proxiedLoads.push(path)
      status = 404
      body = { error: 'Unexpected backend request.' }
    }
    await route.fulfill({ status, json: body })
  })
  await context.route(
    'https://trello-backgrounds.s3.amazonaws.com/**',
    (route) =>
      route.fulfill({
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmL8AAAAASUVORK5CYII=',
          'base64',
        ),
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'image/png',
        },
      }),
  )
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
          desc: '# Card notes\n\nA **detailed description** from Trello.\n\n![Design diagram](https://example.com/description.png)',
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
    await route.abort('blockedbyclient')
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
    const originalIcons = await page
      .locator('head link[rel~="icon"]')
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('href')))
    const readBoardIcon = async (photo = false): Promise<string> => {
      await page.waitForFunction(
        (expectPhoto) =>
          [
            ...globalThis.document.querySelectorAll('head link[rel="icon"]'),
          ].some((icon) => {
            const href = icon.getAttribute('href') || ''
            return (
              href.startsWith('data:image/svg+xml,') &&
              (!expectPhoto ||
                decodeURIComponent(href).includes('<image href="data:image/'))
            )
          }),
        photo,
      )
      const href = await page
        .locator('head link[rel="icon"]')
        .getAttribute('href')
      assert.ok(href)
      await page.evaluate(async (src) => {
        const image = globalThis.document.createElement('img')
        image.src = src
        await image.decode()
        if (image.naturalWidth !== 64)
          throw new Error('Expected a 64px board favicon')
      }, href)
      return decodeURIComponent(href.slice(href.indexOf(',') + 1))
    }
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
    await page.locator('.BoardTitle').click()
    await page.locator('.BoardSearchResults').waitFor({ state: 'hidden' })
    assert.equal(await boardSearch.inputValue(), 'cover')
    await boardSearch.click()
    await page
      .getByRole('button', { name: 'Card · Card with cover — Engineering' })
      .waitFor()
    await boardSearch.press('Tab')
    await page.getByRole('button', { name: 'Board · Engineering' }).waitFor()
    assert.equal(await page.locator('.BoardSearchResult').count(), 2)
    await page.keyboard.press('Enter')
    await page
      .getByRole('heading', { name: 'Engineering', exact: true })
      .waitFor()
    await boardSearch.fill('')
    assert.equal(discoveryLoads.length, 1)
    assert.equal(new URL(page.url()).hash, '#22222222')
    assert.ok(
      (await readBoardIcon(true)).includes(
        '<image href="data:image/png;base64,',
      ),
    )
    const columns = page.locator('.BoardColumn')
    const emptyColumn = columns.nth(1)
    const longColumn = columns.nth(2)
    const emptyColumnBox = await emptyColumn.boundingBox()
    const shortColumnBox = await columns.nth(0).boundingBox()
    const longColumnBox = await longColumn.boundingBox()
    assert.ok(
      emptyColumnBox &&
        shortColumnBox &&
        longColumnBox &&
        emptyColumnBox.height < shortColumnBox.height &&
        shortColumnBox.height < longColumnBox.height,
      'Empty and short columns fit their contents independently of a longer neighbor',
    )
    assert.ok(
      await longColumn
        .locator('.BoardCards')
        .evaluate((element) => element.scrollHeight > element.clientHeight),
      'Long columns keep their cards in a scrollable list',
    )
    const longCards = longColumn.locator('.BoardCards')
    const addCard = longColumn.getByRole('button', {
      name: 'Add a card to Done',
    })
    const footerBottom = async (): Promise<number> => {
      const box = await addCard.boundingBox()
      assert.ok(box, 'Long-list add control stays visible')
      return box.y + box.height
    }
    const initialFooterBottom = await footerBottom()
    assert.ok(initialFooterBottom < 720, 'Add control fits in the viewport')
    await longCards.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    assert.ok(
      Math.abs((await footerBottom()) - initialFooterBottom) < 2,
      'Scrolling cards does not move the add control',
    )
    await longCards.locator('.BoardCard').last().waitFor({ state: 'visible' })
    await longCards.evaluate((element) => {
      element.scrollTop = 0
    })
    assert.ok(
      (await columns.nth(0).boundingBox())!.height < longColumnBox!.height &&
        (await columns.nth(1).boundingBox())!.height < longColumnBox!.height,
      'Empty and short columns remain content-sized',
    )
    assert.deepEqual(boardLoads, ['/api/integrations/trello/boards/22222222'])
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
    assert.ok(
      (await readBoardIcon(true)).includes(
        '<image href="data:image/png;base64,',
      ),
    )
    assert.deepEqual(boardLoads, [
      '/api/integrations/trello/boards/22222222',
      '/api/integrations/trello/boards/22222222',
    ])
    assert.deepEqual(proxiedLoads, [])
    const cover = page.locator('.BoardCardCover')
    await cover.waitFor({ state: 'visible' })
    assert.deepEqual(coverLoads, [
      '/api/integrations/trello/boards/22222222/covers',
      '/api/integrations/trello/boards/22222222/covers',
    ])
    const coverSrc = await cover.getAttribute('src')
    assert.ok(coverSrc)
    assert.match(coverSrc, /^data:image\/png;base64,/u)
    const labels = page.locator('.BoardCardLabels')
    await labels.waitFor()
    assert.equal(await labels.count(), 1)
    assert.deepEqual(
      await labels.getByRole('img').evaluateAll((elements) =>
        elements.map((element) => ({
          ariaLabel: element.getAttribute('aria-label'),
          className: element.className,
        })),
      ),
      [
        {
          ariaLabel: 'In progress',
          className: 'BoardCardLabel BoardCardLabel-yellow',
        },
        { ariaLabel: 'Urgent', className: 'BoardCardLabel BoardCardLabel-red' },
      ],
    )
    assert.equal(
      await labels.locator('..').evaluate((element) => {
        const children = [...element.children].map((child) => child.className)
        return (
          children.indexOf('BoardCardLabels') <
          children.indexOf('BoardCardTitle')
        )
      }),
      true,
    )
    assert.equal(
      await page
        .locator('.BoardCard')
        .filter({ hasText: 'No activity' })
        .locator('.BoardCardLabels')
        .count(),
      0,
    )
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
    await dialog.getByRole('heading', { name: 'Card notes' }).waitFor()
    await dialog.getByText('A detailed description', { exact: false }).waitFor()
    assert.equal(
      await dialog.locator('.BoardDescriptionImage').getAttribute('src'),
      'https://example.com/description.png',
    )
    assert.equal(await dialog.getByLabel('Status: Todo').textContent(), 'Todo')
    assert.equal(await dialog.locator('.BoardDescriptionMarkdown').count(), 1)
    const descriptionEdit = dialog.getByRole('button', {
      name: 'Edit description',
    })
    assert.equal(
      await descriptionEdit.evaluate((button) => button.type),
      'button',
    )
    await descriptionEdit.click()
    assert.equal(
      await dialog
        .getByRole('textbox', { name: 'Markdown source' })
        .inputValue(),
      '# Card notes\n\nA **detailed description** from Trello.\n\n![Design diagram](https://example.com/description.png)',
    )
    assert.deepEqual(moveRequests, [])
    await dialog.getByRole('button', { name: 'Preview' }).click()
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
      `Activity stacks below details on mobile (viewport=390x844, main=${JSON.stringify(narrowMain)}, activity=${JSON.stringify(narrowActivity)})`,
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
    await dialog.getByRole('textbox', { name: 'Title' }).click()
    await dialog.waitFor()
    await page
      .locator('.BoardDialogOverlay')
      .click({ position: { x: 5, y: 5 } })
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
      await page
        .locator(`.BoardAddCard[aria-label="Add a card to ${list}"]`)
        .click()
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
      // Moving focus outside the composer dismisses it and restores its
      // original add control.
      await openBoardOptions()
      await title.waitFor({ state: 'detached' })
      await page
        .locator(`.BoardAddCard[aria-label="Add a card to ${list}"]`)
        .waitFor()
      const refreshButton = page.getByRole('button', {
        name: 'Refresh board',
        exact: true,
      })
      const refreshed = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
          '/api/integrations/trello/boards/22222222',
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
      assert.equal(await title.count(), 0)
      await openBoardOptions()
    }
    process.stdout.write('Add card focuses title on open and reopen: pass\n')
    await openBoardOptions()
    const refresh = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname ===
          '/api/integrations/trello/boards/22222222',
    )
    await page
      .getByRole('button', { name: 'Refresh board', exact: true })
      .click()
    await refresh
    assert.equal(boardLoads.length, 6)
    assert.deepEqual(proxiedLoads, [])
    await openBoardOptions()
    await page
      .getByRole('button', { name: 'Connect another board', exact: true })
      .click()
    await page.waitForFunction(
      () =>
        ![
          ...globalThis.document.querySelectorAll('head link[rel="icon"]'),
        ].some((icon) =>
          icon.getAttribute('href')?.startsWith('data:image/svg+xml,'),
        ),
    )
    assert.deepEqual(
      await page
        .locator('head link[rel~="icon"]')
        .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('href'))),
      originalIcons,
    )
    empty = true
    await page
      .getByRole('button', { name: 'Connect Trello', exact: true })
      .click()
    await page.getByText('No open boards found.', { exact: false }).waitFor()
    const rememberedTile = page.locator(
      '.BoardRemembered button[name="board-select:22222222"]',
    )
    assert.equal(await rememberedTile.innerText(), '22222222')
    assert.equal(await rememberedTile.getAttribute('class'), 'BoardTile')
    assert.equal(
      await rememberedTile.getAttribute('aria-label'),
      'Open remembered board 22222222',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    let rememberedTileFocused = false
    for (let index = 0; index < 100 && !rememberedTileFocused; index++) {
      await page.keyboard.press('Tab')
      rememberedTileFocused = await rememberedTile.evaluate(
        (element) => globalThis.document.activeElement === element,
      )
    }
    assert.equal(
      rememberedTileFocused,
      true,
      'Remembered board is keyboard reachable',
    )
    assert.equal(
      await rememberedTile.evaluate(
        (element) => globalThis.getComputedStyle(element).outlineStyle,
      ),
      'solid',
    )
    const rememberedTileBox = await rememberedTile.boundingBox()
    assert.ok(
      rememberedTileBox &&
        rememberedTileBox.x >= 0 &&
        rememberedTileBox.x + rememberedTileBox.width <= 390,
      'Remembered board tile fits a narrow viewport',
    )
    if (process.env.BOARD_REMEMBERED_SCREENSHOT)
      await page.screenshot({ path: process.env.BOARD_REMEMBERED_SCREENSHOT })
    await page.setViewportSize({ width: 1280, height: 720 })
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
    const gradientIcon = await readBoardIcon()
    assert.ok(gradientIcon.includes('stop-color="#a82be0"'))
    assert.ok(gradientIcon.includes('stop-color="#ff58b0"'))
    process.stdout.write(
      'static Trello discovery, board favicons, clickable board tiles, empty state and retry: pass\n',
    )
  } finally {
    await context.close()
  }
}
