import { expect, jest, test } from '@jest/globals'
import type { BackendConfiguration } from '../src/parts/BackendConfiguration/BackendConfiguration.ts'
import type { TrelloBoard } from '../src/parts/BoardView/Trello.ts'
import {
  createTrelloClient,
  parseBoardId,
} from '../src/parts/BoardView/Trello.ts'

const board = {
  cards: [
    { id: 'b', idList: 'now', name: 'Second', pos: 2 },
    { id: 'a', idList: 'now', name: 'First', pos: 1 },
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
  supportsStreaming: true,
})
const loadBoard = (
  id: string,
  signal: Readonly<AbortSignal>,
  request: typeof fetch,
): Promise<TrelloBoard> =>
  createTrelloClient(configuration, request).load(id, signal)

const requestWith = (data: unknown, status = 200): typeof fetch =>
  jest.fn<typeof fetch>().mockResolvedValue(Response.json(data, { status }))

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

test('loads source-ordered lists and cards through the backend with only the LVCE bearer token', async () => {
  const request = requestWith({
    ...board,
    cards: [
      ...board.cards,
      {
        cover: { url: 'https://trello.com/1/cards/card/cover' },
        id: 'covered',
        idList: 'now',
        name: 'Cover',
        pos: 3,
      },
      {
        cover: { url: 'https://evil.test/image.png' },
        id: 'unsafe',
        idList: 'now',
        name: 'No cover',
        pos: 4,
      },
    ],
  })
  const result = await loadBoard(
    '5k8NLHLh',
    new AbortController().signal,
    request,
  )
  expect(result.lists.map((list) => list.name)).toEqual(['Now', 'Later'])
  expect(result.cards.map((card) => card.name)).toEqual([
    'First',
    'Second',
    'Cover',
    'No cover',
  ])
  expect(result.cards.find((card) => card.name === 'Cover')?.coverUrl).toBe(
    'https://trello.com/1/cards/card/cover',
  )
  expect(
    result.cards.find((card) => card.name === 'No cover')?.coverUrl,
  ).toBeUndefined()
  expect(request).toHaveBeenCalledWith(
    'https://backend.test/api/integrations/trello/boards/5k8NLHLh',
    expect.objectContaining({
      headers: {
        Authorization: 'Bearer lvce-token',
      },
    }),
  )
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
    await expect(
      loadBoard(
        '5k8NLHLh',
        new AbortController().signal,
        requestWith('secret upstream body', status),
      ),
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
  await expect(
    loadBoard('5k8NLHLh', signal, requestWith({ ...board, lists: null })),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_INVALID_RESPONSE' } })
  const invalidJson = jest
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('not json'))
  await expect(
    loadBoard('5k8NLHLh', signal, invalidJson),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_REQUEST_FAILED' } })
})

test('requires LVCE login and never forwards its token to an unrelated backend', async () => {
  const request = requestWith(board)
  const client = createTrelloClient(
    async () => ({
      accessToken: '',
      baseUrl: 'https://other.test',
      supportsStreaming: false,
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
  expect(request.mock.calls[1]?.[1]).toMatchObject({
    credentials: 'omit',
    headers: { Authorization: 'Bearer new-lvce-token' },
    redirect: 'error',
  })
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

test('creates cards through the backend without provider credentials', async () => {
  const card = { id: 'new', idList: 'todo', name: 'New task', pos: 3 }
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
  for (const status of [403, 500]) {
    const request = requestWith({ secret: 'private' }, status)
    const client = createTrelloClient(configuration, request)
    await expect(
      client.createCard('todo', 'Task', new AbortController().signal),
    ).rejects.toMatchObject({
      details: {
        code: status === 403 ? 'TRELLO_WRITE_DENIED' : 'TRELLO_CREATE_FAILED',
      },
    })
    expect(request).toHaveBeenCalledTimes(1)
  }
})
