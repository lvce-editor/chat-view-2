import { expect, jest, test } from '@jest/globals'
import { loadBoard, parseBoardId } from '../src/parts/BoardView/Trello.ts'

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

test('loads source-ordered lists and cards, with credentials only in the authorization header', async () => {
  const request = requestWith(board)
  const result = await loadBoard(
    '5k8NLHLh',
    'key123',
    'token123',
    new AbortController().signal,
    request,
  )
  expect(result.lists.map((list) => list.name)).toEqual(['Now', 'Later'])
  expect(result.cards.map((card) => card.name)).toEqual(['First', 'Second'])
  expect(request).toHaveBeenCalledWith(
    expect.not.stringContaining('token123'),
    expect.objectContaining({
      headers: {
        Authorization:
          'OAuth oauth_consumer_key="key123", oauth_token="token123"',
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
        'key',
        'token',
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
  await expect(
    loadBoard('5k8NLHLh', 'key', 'token', signal, offline),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_REQUEST_FAILED' } })
  await expect(
    loadBoard(
      '5k8NLHLh',
      'key',
      'token',
      signal,
      requestWith({ ...board, lists: null }),
    ),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_INVALID_RESPONSE' } })
  const invalidJson = jest
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('not json'))
  await expect(
    loadBoard('5k8NLHLh', 'key', 'token', signal, invalidJson),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_REQUEST_FAILED' } })
})

test('validates credentials before making a request', async () => {
  const request = requestWith(board)
  await expect(
    loadBoard('5k8NLHLh', '', '', new AbortController().signal, request),
  ).rejects.toMatchObject({ details: { code: 'TRELLO_CREDENTIALS_REQUIRED' } })
  expect(request).not.toHaveBeenCalled()
})
