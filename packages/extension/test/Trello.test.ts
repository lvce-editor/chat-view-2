// cspell:words prefs AQID

import { expect, jest, test } from '@jest/globals'
import type { BackendConfiguration } from '../src/parts/BackendConfiguration/BackendConfiguration.ts'
import type { TrelloBoard } from '../src/parts/BoardView/Trello.ts'
import {
  createTrelloClient,
  parseBoardId,
} from '../src/parts/BoardView/Trello.ts'

const board = {
  cards: [
    { desc: '', id: 'b', idList: 'now', name: 'Second', pos: 2 },
    { desc: 'Details', id: 'a', idList: 'now', name: 'First', pos: 1 },
  ],
  id: 'board-id',
  lists: [
    { id: 'later', name: 'Later', pos: 20 },
    { id: 'now', name: 'Now', pos: 10 },
  ],
  name: 'Work',
}

const configuration = async (): Promise<BackendConfiguration> => ({
  accessToken: 'lvce-token',
  baseUrl: 'https://backend.test',
  responseMethod: 'websocket',
})
const loadBoard = (
  id: string,
  signal: Readonly<AbortSignal>,
  request: typeof fetch,
): Promise<TrelloBoard> =>
  createTrelloClient(configuration, request).load(id, signal)

const requestWith = (data: unknown, status = 200): typeof fetch =>
  jest.fn<typeof fetch>().mockResolvedValue(Response.json(data, { status }))
const requestSequence = (
  responses: readonly Response[],
): jest.MockedFunction<typeof fetch> => {
  const request = jest.fn<typeof fetch>()
  for (const response of responses) request.mockResolvedValueOnce(response)
  return request
}
const boardListRequest = (data: unknown): typeof fetch =>
  requestSequence([
    Response.json({ accessToken: 'trello-token' }),
    Response.json(data),
  ])
const trelloBoardUrlPattern =
  /^https:\/\/api\.trello\.com\/1\/boards\/5k8NLHLh\?/u

test('accepts board URLs and IDs, rejecting unrelated URLs', () => {
  expect(parseBoardId(' https://trello.com/b/5k8NLHLh/lvce-editor ')).toBe(
    '5k8NLHLh',
  )
  expect(parseBoardId('677af2a97a77d55c7ffd7bd9')).toBe(
    '677af2a97a77d55c7ffd7bd9',
  )
  expect(() => parseBoardId('https://example.com/b/5k8NLHLh')).toThrow(
    'Enter a Trello board URL',
  )
})

test('loads source-ordered lists and cards directly from Trello with a scoped Trello token', async () => {
  const request = requestSequence([
    Response.json({ accessToken: 'trello-token' }),
    Response.json({
      ...board,
      cards: [
        ...board.cards,
        {
          cover: {
            idAttachment: '507f1f77bcf86cd799439013',
          },
          id: '507f1f77bcf86cd799439012',
          idList: 'now',
          name: 'Cover',
          pos: 3,
        },
        {
          id: 'unsafe',
          idList: 'now',
          name: 'No cover',
          pos: 4,
        },
      ],
      prefs: {
        backgroundBottomColor: '#ff58b0',
        backgroundTopColor: '#a82be0',
      },
    }),
    Response.json({
      previews: [
        {
          url: 'https://trello.com/1/cards/covered/previews/small',
          width: 150,
        },
        {
          url: 'https://trello.com/1/cards/covered/previews/large',
          width: 300,
        },
      ],
    }),
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/webp' },
    }),
  ])
  const result = await loadBoard(
    '5k8NLHLh',
    new AbortController().signal,
    request,
  )
  expect(result).toMatchObject({
    backgroundColor: '#ff58b0',
    backgroundGradient: 'linear-gradient(135deg, #a82be0, #ff58b0)',
  })
  expect(decodeURIComponent(result.faviconUrl || '')).toContain(
    'stop-color="#a82be0"',
  )
  expect(result.lists.map((list) => list.name)).toEqual(['Now', 'Later'])
  expect(result.cards.map((card) => card.name)).toEqual([
    'First',
    'Second',
    'Cover',
    'No cover',
  ])
  expect(result.cards.find((card) => card.name === 'Cover')?.coverDataUrl).toBe(
    'data:image/webp;base64,AQID',
  )
  expect(
    result.cards.find((card) => card.name === 'No cover')?.coverDataUrl,
  ).toBeUndefined()
  expect(request).toHaveBeenNthCalledWith(
    1,
    'https://backend.test/api/integrations/trello/token',
    expect.objectContaining({
      headers: {
        Authorization: 'Bearer lvce-token',
      },
    }),
  )
  expect(request).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(trelloBoardUrlPattern),
    expect.objectContaining({
      credentials: 'omit',
      headers: { Authorization: 'Bearer trello-token' },
    }),
  )
  const boardUrl = request.mock.calls[1]?.[0]
  expect(
    typeof boardUrl === 'string' &&
      new URL(boardUrl).searchParams.get('fields'),
  ).toBe('name,prefs')
  expect(JSON.stringify(request.mock.calls[1])).not.toContain('lvce-token')
  expect(request).toHaveBeenNthCalledWith(
    3,
    'https://api.trello.com/1/cards/507f1f77bcf86cd799439012/attachments/507f1f77bcf86cd799439013',
    expect.objectContaining({
      credentials: 'omit',
      headers: { Authorization: 'Bearer trello-token' },
      redirect: 'error',
    }),
  )
  expect(request).toHaveBeenNthCalledWith(
    4,
    'https://trello.com/1/cards/covered/previews/large',
    expect.objectContaining({
      credentials: 'omit',
      headers: { Authorization: 'Bearer trello-token' },
      redirect: 'error',
    }),
  )
  expect(JSON.stringify(request.mock.calls)).not.toContain('AQID')
})

test('searches accessible Trello boards and cards with validated board ownership', async () => {
  const request = requestSequence([
    Response.json({ accessToken: 'trello-token' }),
    Response.json({
      boards: [{ id: '5k8NLHLh', name: 'Work' }],
      cards: [
        {
          id: '507f1f77bcf86cd799439011',
          idBoard: '12345678',
          name: 'Chat task',
        },
      ],
    }),
  ])
  const client = createTrelloClient(configuration, request)
  await expect(
    client.search('chat', new AbortController().signal),
  ).resolves.toEqual([
    { id: '5k8NLHLh', kind: 'board', name: 'Work' },
    {
      boardId: '12345678',
      boardName: '',
      id: '507f1f77bcf86cd799439011',
      kind: 'card',
      name: 'Chat task',
    },
  ])
  expect(request.mock.calls[1]?.[0]).toContain('/1/search?')
  expect(request.mock.calls[1]?.[0]).toContain('cards_limit=20')
  expect(request.mock.calls[1]?.[1]).toMatchObject({
    headers: { Authorization: 'Bearer trello-token' },
  })
})

for (const [status, code] of [
  [400, 'TRELLO_BOARD_NOT_FOUND'],
  [404, 'TRELLO_BOARD_NOT_FOUND'],
  [401, 'TRELLO_ACCESS_DENIED'],
  [403, 'TRELLO_ACCESS_DENIED'],
  [429, 'TRELLO_RATE_LIMITED'],
  [500, 'TRELLO_SERVER_ERROR'],
] as const) {
  test(`maps HTTP ${status} to ${code} without exposing the response body`, async () => {
    const request = requestSequence([
      Response.json({ accessToken: 'trello-token' }),
      Response.json('secret upstream body', { status }),
    ])
    await expect(
      loadBoard('5k8NLHLh', new AbortController().signal, request),
    ).rejects.toMatchObject({
      details: { code, message: expect.not.stringContaining('secret') },
    })
  })
}

test('handles transport failures, invalid JSON and malformed board data', async () => {
  const { signal } = new AbortController()
  const offline = jest
    .fn<typeof fetch>()
    .mockRejectedValue(new Error('secret upstream URL'))
  await expect(loadBoard('5k8NLHLh', signal, offline)).rejects.toMatchObject({
    details: { code: 'TRELLO_REQUEST_FAILED' },
  })
  const malformedBoardRequest = requestSequence([
    Response.json({ accessToken: 'trello-token' }),
    Response.json({ ...board, lists: null }),
  ])
  await expect(
    loadBoard('5k8NLHLh', signal, malformedBoardRequest),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_INVALID_RESPONSE' } })
  const invalidJson = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ accessToken: 'trello-token' }))
    .mockResolvedValue(new Response('not json'))
  await expect(
    loadBoard('5k8NLHLh', signal, invalidJson),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_REQUEST_FAILED' } })
})

test('passes cancellation to the direct Trello request', async () => {
  const controller = new AbortController()
  const tokenResponse = Response.json({ accessToken: 'trello-token' })
  jest.spyOn(tokenResponse, 'json').mockImplementation(async () => {
    controller.abort()
    return { accessToken: 'trello-token' }
  })
  const request = requestSequence([tokenResponse, Response.json(board)])
  await loadBoard('5k8NLHLh', controller.signal, request)
  expect(request.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  expect(request.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
  expect(request).toHaveBeenCalledTimes(2)
})

test('requires LVCE login and never forwards its token to an unrelated backend', async () => {
  const request = requestWith(board)
  const client = createTrelloClient(
    async () => ({
      accessToken: '',
      baseUrl: 'https://other.test',
      responseMethod: 'http',
    }),
    request,
  )
  await expect(
    client.load('5k8NLHLh', new AbortController().signal),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_LOGIN_REQUIRED' } })
  expect(request).not.toHaveBeenCalled()
})

test('refreshes the LVCE access token once on 401 and omits cookies', async () => {
  const request = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ accessToken: 'trello-token' }))
    .mockResolvedValueOnce(Response.json(board))
  const refreshAccessToken = jest
    .fn<() => Promise<string>>()
    .mockResolvedValue('new-lvce-token')
  const client = createTrelloClient(
    async () => ({ ...(await configuration()), refreshAccessToken }),
    request,
  )
  await client.load('5k8NLHLh', new AbortController().signal)
  expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[2]?.[1]).toMatchObject({
    credentials: 'omit',
    headers: { Authorization: 'Bearer trello-token' },
    redirect: 'error',
  })
})

test('updates only the selected card title and description through the LVCE backend', async () => {
  const request = requestWith({
    desc: 'Updated details',
    id: '507f1f77bcf86cd799439011',
    idList: 'list',
    name: 'Updated title',
    pos: 1,
  })
  const client = createTrelloClient(configuration, request)
  const updated = await client.updateCard(
    '507f1f77bcf86cd799439011',
    'Updated title',
    'Updated details',
    new AbortController().signal,
  )
  expect(updated).toMatchObject({
    desc: 'Updated details',
    name: 'Updated title',
  })
  expect(request).toHaveBeenCalledWith(
    'https://backend.test/api/integrations/trello/cards/507f1f77bcf86cd799439011',
    expect.objectContaining({
      body: JSON.stringify({ desc: 'Updated details', name: 'Updated title' }),
      headers: {
        Authorization: 'Bearer lvce-token',
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }),
  )
})

test('rejects authorization links outside the trusted backend callback launcher', async () => {
  for (const url of [
    'https://evil.test/auth/trello/connect?ticket=x',
    'https://backend.test/redirect?ticket=x',
  ]) {
    const client = createTrelloClient(configuration, requestWith({ url }))
    await expect(
      client.authorize(new AbortController().signal),
    ).rejects.toThrow()
  }
})

test('supports status, launching consent, and disconnect without Trello credentials', async () => {
  const request = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ configured: true, connected: true }))
    .mockResolvedValueOnce(
      Response.json({
        url: 'https://backend.test/auth/trello/connect?ticket=one-use',
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  const client = createTrelloClient(configuration, request)
  const { signal } = new AbortController()
  expect(await client.status(signal)).toEqual({
    configured: true,
    connected: true,
  })
  expect(await client.authorize(signal)).toBe(
    'https://backend.test/auth/trello/connect?ticket=one-use',
  )
  await client.disconnect(signal)
  expect(request.mock.calls[2]?.[1]?.method).toBe('POST')
})

test('discovers board names and background preferences directly from Trello', async () => {
  const request = requestSequence([
    Response.json({ accessToken: 'trello-token' }),
    Response.json([
      {
        id: '222222221111111133333333',
        name: 'Zebra',
        prefs: {
          backgroundImageScaled: [
            {
              url: 'https://trello-backgrounds.s3.amazonaws.com/zebra-small.jpg',
            },
            {
              url: 'https://trello-backgrounds.s3.amazonaws.com/zebra-large.jpg',
            },
          ],
        },
        shortLink: '22222222',
      },
      {
        extra: 'discard',
        id: '11111111',
        name: 'Alpha',
        prefs: { backgroundColor: '#22a06b' },
      },
      {
        id: '33333333',
        name: 'Gradient',
        prefs: {
          backgroundBottomColor: '#8b4dc8',
          backgroundTopColor: '#0c66e4',
        },
      },
    ]),
  ])
  const client = createTrelloClient(configuration, request)
  expect(await client.boards(new AbortController().signal)).toEqual([
    { backgroundColor: '#22a06b', id: '11111111', name: 'Alpha' },
    {
      backgroundColor: '#8b4dc8',
      backgroundGradient: 'linear-gradient(135deg, #0c66e4, #8b4dc8)',
      id: '33333333',
      name: 'Gradient',
    },
    {
      backgroundImage:
        'https://trello-backgrounds.s3.amazonaws.com/zebra-large.jpg',
      id: '22222222',
      name: 'Zebra',
    },
  ])
  expect(request).toHaveBeenCalledWith(
    'https://backend.test/api/integrations/trello/token',
    expect.objectContaining({
      credentials: 'omit',
      headers: { Authorization: 'Bearer lvce-token' },
    }),
  )
  expect(request).toHaveBeenNthCalledWith(
    2,
    'https://api.trello.com/1/members/me/boards?fields=id%2Cname%2Cprefs%2CshortLink&filter=open',
    expect.objectContaining({
      credentials: 'omit',
      headers: { Authorization: 'Bearer trello-token' },
    }),
  )
})

test('keeps cards usable when cover attachment metadata cannot be loaded', async () => {
  const result = await loadBoard(
    '5k8NLHLh',
    new AbortController().signal,
    requestSequence([
      Response.json({ accessToken: 'trello-token' }),
      Response.json({
        ...board,
        cards: [
          {
            cover: {
              idAttachment: '507f1f77bcf86cd799439013',
            },
            id: '507f1f77bcf86cd799439012',
            idList: 'now',
            name: 'Still usable',
            pos: 1,
          },
        ],
      }),
      new Response('forbidden', { status: 403 }),
    ]),
  )
  expect(result.cards).toEqual([
    expect.objectContaining({
      id: '507f1f77bcf86cd799439012',
      name: 'Still usable',
    }),
  ])
  expect(result.cards[0]?.coverDataUrl).toBeUndefined()
})

test('accepts empty discovery and rejects malformed board lists', async () => {
  const { signal } = new AbortController()
  const emptyBoards = await createTrelloClient(
    configuration,
    boardListRequest([]),
  ).boards(signal)
  expect(emptyBoards).toEqual([])
  for (const data of [
    {},
    [{ id: '../bad', name: 'Work' }],
    [{ id: '11111111', name: null }],
  ]) {
    await expect(
      createTrelloClient(configuration, boardListRequest(data)).boards(signal),
    ).rejects.toMatchObject({ details: { code: 'TRELLO_INVALID_RESPONSE' } })
  }
})

test('normalizes comment and attachment badges without rejecting older boards', async () => {
  const values: readonly unknown[] = [
    undefined,
    null,
    {},
    { attachments: 1, comments: 3 },
    { attachments: '2', comments: -1 },
    { attachments: Infinity, comments: 1.5 },
  ]
  const cards = values.map((badges, index) => ({
    badges,
    id: String(index),
    idList: 'now',
    name: 'Task',
    pos: index,
  }))
  const result = await loadBoard(
    '5k8NLHLh',
    new AbortController().signal,
    requestSequence([
      Response.json({ accessToken: 'trello-token' }),
      Response.json({ ...board, cards }),
    ]),
  )
  expect(
    result.cards.map(({ attachmentCount, commentCount }) => [
      commentCount,
      attachmentCount,
    ]),
  ).toEqual([
    [0, 0],
    [0, 0],
    [0, 0],
    [3, 1],
    [0, 0],
    [0, 0],
  ])
})

test('moves a card through the authenticated backend without exposing Trello tokens', async () => {
  const request = jest
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status: 204 }))
  const client = createTrelloClient(configuration, request)
  await client.moveCard(
    '0123456789abcdef01234567',
    '89abcdef0123456701234567',
    new AbortController().signal,
  )
  expect(request).toHaveBeenCalledWith(
    'https://backend.test/api/integrations/trello/cards/0123456789abcdef01234567/list/89abcdef0123456701234567',
    expect.objectContaining({
      credentials: 'omit',
      headers: { Authorization: 'Bearer lvce-token' },
      method: 'PUT',
      redirect: 'error',
    }),
  )
})

test('reports when Trello needs renewed write permission', async () => {
  const request = jest
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ code: 'TRELLO_REAUTHORIZE_REQUIRED' }, { status: 403 }),
    )
  const client = createTrelloClient(configuration, request)
  await expect(
    client.moveCard(
      '0123456789abcdef01234567',
      '89abcdef0123456701234567',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    details: { code: 'TRELLO_REAUTHORIZE_REQUIRED' },
  })
})

test('rejects malformed card or list IDs before making a request', async () => {
  const request = requestWith({})
  const client = createTrelloClient(configuration, request)
  await expect(
    client.moveCard('../members/me', 'list', new AbortController().signal),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_INVALID_MOVE' } })
  expect(request).not.toHaveBeenCalled()
})

test('creates cards through the backend without provider credentials', async () => {
  const card = {
    attachmentCount: 0,
    commentCount: 0,
    desc: '',
    id: 'new',
    idList: 'todo',
    name: 'New task',
    pos: 3,
  }
  const request = requestWith(card)
  const client = createTrelloClient(configuration, request)
  expect(
    await client.createCard('todo', ' New task ', new AbortController().signal),
  ).toEqual(card)
  expect(request).toHaveBeenCalledWith(
    'https://backend.test/api/integrations/trello/cards',
    expect.objectContaining({
      body: JSON.stringify({ idList: 'todo', name: 'New task' }),
      headers: {
        Authorization: 'Bearer lvce-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }),
  )
})

test('write denial explains reconnecting and unconfirmed writes are never retried', async () => {
  const deniedRequest = requestWith({ secret: 'private' }, 403)
  const client = createTrelloClient(configuration, deniedRequest)
  await expect(
    client.createCard('todo', 'Task', new AbortController().signal),
  ).rejects.toMatchObject({
    details: {
      code: 'TRELLO_WRITE_DENIED',
      message:
        'Trello rejected this card. Check that you can add cards to this board. If you can, disconnect and reconnect Trello to refresh its access. Your title is still here so you can retry.',
    },
  })
  expect(deniedRequest).toHaveBeenCalledTimes(1)

  const failedRequest = requestWith({ secret: 'private' }, 500)
  const failedClient = createTrelloClient(configuration, failedRequest)
  await expect(
    failedClient.createCard('todo', 'Task', new AbortController().signal),
  ).rejects.toMatchObject({
    details: {
      code: 'TRELLO_CREATE_FAILED',
      message:
        'The card could not be confirmed. Refresh the board before trying again to avoid duplicates. Your title has been kept.',
    },
  })
  expect(failedRequest).toHaveBeenCalledTimes(1)
})

test('loads card attachments and comments directly, discarding unsafe links and unknown activities', async () => {
  const request = requestSequence([
    Response.json({ accessToken: 'trello-token' }),
    Response.json({
      actions: [
        {
          data: { text: '<script>plain text</script>' },
          date: '2026-11-16',
          memberCreator: { fullName: 'A member' },
          type: 'commentCard',
        },
        { data: {}, date: '2026-11-15', type: 'createCard' },
        {
          data: { listAfter: { name: 'Doing' } },
          date: '2026-11-14',
          type: 'updateCard',
        },
        { data: {}, date: '2026-11-13', type: 'unknown' },
      ],
      attachments: [
        { name: 'design.png', url: 'https://example.com/design.png' },
        { name: 'Unsafe', url: 'javascript:alert(1)' },
      ],
      desc: 'Full description',
    }),
  ])
  const details = await createTrelloClient(configuration, request).loadCard(
    'aaaaaaaaaaaaaaaaaaaaaaaa',
    new AbortController().signal,
  )
  expect(details).toEqual({
    activities: [
      {
        author: 'A member',
        date: '2026-11-16',
        text: '<script>plain text</script>',
      },
      {
        author: 'Trello member',
        date: '2026-11-15',
        text: 'Created this card',
      },
      {
        author: 'Trello member',
        date: '2026-11-14',
        text: 'Moved this card to Doing',
      },
    ],
    attachments: [
      { name: 'design.png', url: 'https://example.com/design.png' },
    ],
    desc: 'Full description',
  })
  const url = new URL(request.mock.calls[1]?.[0] as string)
  expect(url.origin).toBe('https://api.trello.com')
  expect(url.searchParams.get('attachments')).toBe('true')
  expect(url.searchParams.get('actions')).toBe(
    'commentCard,createCard,updateCard:idList',
  )
})

test('rejects incomplete card detail responses instead of presenting missing data as empty', async () => {
  const request = requestSequence([
    Response.json({ accessToken: 'trello-token' }),
    Response.json({ desc: 'Details' }),
  ])
  await expect(
    createTrelloClient(configuration, request).loadCard(
      'aaaaaaaaaaaaaaaaaaaaaaaa',
      new AbortController().signal,
    ),
  ).rejects.toThrow('Unable to load card details')
})
