// cspell:ignore prefs

import { expect, test } from '@jest/globals'
import { createMemoryTrelloApiCache } from '../src/parts/TrelloClient/TrelloApiCache.ts'
import { createTrelloClient } from '../src/parts/TrelloClient/TrelloClient.ts'

const validApiKey = 'abcdefghijklmnopqrstuvwxyz123456'
const validToken =
  'abcdefghijklmnopqrstuvwxyz123456abcdefghijklmnopqrstuvwxyz123456'
const credentialFingerprintPattern = /^[a-f0-9]{64}$/

const jsonResponse = (value: unknown): Response => {
  return Response.json(value, {
    status: 200,
  })
}

test('listBoards requests member boards with credentials', async () => {
  const requests: string[] = []
  const client = createTrelloClient(async (url) => {
    requests.push(url)
    return jsonResponse([{ id: 'board-1', name: 'Roadmap' }])
  })

  await expect(
    client.listBoards({
      apiKey: validApiKey,
      token: validToken,
    }),
  ).resolves.toEqual([{ id: 'board-1', name: 'Roadmap' }])

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/members/me/boards')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('fields')).toBe(
    'name,url,dateLastView,idOrganization,prefs',
  )
  expect(url.searchParams.get('organization')).toBe('true')
  expect(url.searchParams.get('organization_fields')).toBe('name,displayName')
})

test('listBoards caches responses without storing credentials in cache keys', async () => {
  const cache = createMemoryTrelloApiCache()
  const client = createTrelloClient(async () => {
    return jsonResponse([{ id: 'board-1', name: 'Roadmap' }])
  }, cache)
  const credentials = {
    apiKey: validApiKey,
    token: validToken,
  }

  await expect(client.listBoards(credentials)).resolves.toEqual([
    { id: 'board-1', name: 'Roadmap' },
  ])

  const keys = cache.keys()
  expect(keys).toHaveLength(1)
  const cacheUrl = new URL(keys[0])
  expect(cacheUrl.searchParams.get('key')).toBeNull()
  expect(cacheUrl.searchParams.get('token')).toBeNull()
  expect(cacheUrl.href).not.toContain(validApiKey)
  expect(cacheUrl.href).not.toContain(validToken)
  expect(cacheUrl.searchParams.get('credential')).toMatch(
    credentialFingerprintPattern,
  )
  expect(cacheUrl.searchParams.get('fields')).toBe(
    'name,url,dateLastView,idOrganization,prefs',
  )
})

test('getCardDetailCacheFirst returns cached data before fresh data', async () => {
  const cache = createMemoryTrelloApiCache()
  let cardName = 'Cached card'
  const client = createTrelloClient(async (url) => {
    if (url.includes('/cards/card-1/attachments')) {
      return jsonResponse([])
    }
    if (url.includes('/cards/card-1/actions')) {
      return jsonResponse([])
    }
    return jsonResponse({
      desc: 'Detailed card description',
      id: 'card-1',
      name: cardName,
    })
  }, cache)
  const credentials = {
    apiKey: validApiKey,
    token: validToken,
  }

  await client.getCardDetail({ id: 'card-1', name: 'Cached card' }, credentials)
  cardName = 'Fresh card'

  const result = await client.getCardDetailCacheFirst(
    { id: 'card-1', name: 'Cached card' },
    credentials,
  )

  expect(result.cached?.card.name).toBe('Cached card')
  await expect(result.fresh).resolves.toEqual({
    attachments: [],
    card: {
      desc: 'Detailed card description',
      id: 'card-1',
      name: 'Fresh card',
    },
    comments: [],
  })
})

test('getCardDetailPartsCacheFirst returns cached data and staged fresh requests', async () => {
  const cache = createMemoryTrelloApiCache()
  const requests: string[] = []
  let cardName = 'Cached card'
  const client = createTrelloClient(async (url) => {
    requests.push(url)
    if (url.includes('/cards/card-1/attachments')) {
      return jsonResponse([
        {
          id: 'attachment-1',
          mimeType: 'image/png',
          name: 'Screenshot',
          previews: [{ url: 'https://example.com/preview.png' }],
          url: 'https://example.com/screenshot.png',
        },
      ])
    }
    if (url.includes('/cards/card-1/actions')) {
      return jsonResponse([
        {
          data: {
            text: 'Staged comment',
          },
          id: 'comment-1',
        },
      ])
    }
    return jsonResponse({
      desc: 'Detailed card description',
      id: 'card-1',
      name: cardName,
    })
  }, cache)
  const credentials = {
    apiKey: validApiKey,
    token: validToken,
  }

  await client.getCardDetail({ id: 'card-1', name: 'Cached card' }, credentials)
  cardName = 'Fresh card'
  requests.length = 0

  const result = await client.getCardDetailPartsCacheFirst(
    { id: 'card-1', name: 'Cached card' },
    credentials,
  )

  expect(result.cached?.card.name).toBe('Cached card')
  await expect(result.fresh.card).resolves.toEqual({
    desc: 'Detailed card description',
    id: 'card-1',
    name: 'Fresh card',
  })
  await expect(result.fresh.attachments).resolves.toHaveLength(1)
  await expect(result.fresh.comments).resolves.toHaveLength(1)
  expect(
    requests
      .map((request) => new URL(request).pathname)
      .toSorted((a, b) => a.localeCompare(b)),
  ).toEqual([
    '/1/cards/card-1',
    '/1/cards/card-1/actions',
    '/1/cards/card-1/attachments',
  ])
  const cardRequest = requests.find((request) => {
    return new URL(request).pathname === '/1/cards/card-1'
  })
  const attachmentsRequest = requests.find((request) => {
    return new URL(request).pathname === '/1/cards/card-1/attachments'
  })
  const commentsRequest = requests.find((request) => {
    return new URL(request).pathname === '/1/cards/card-1/actions'
  })
  expect(new URL(cardRequest || '').searchParams.get('fields')).toBe(
    'name,desc,url,idBoard,idList,labels',
  )
  expect(new URL(attachmentsRequest || '').searchParams.get('fields')).toBe(
    'name,url,mimeType,previews',
  )
  expect(new URL(commentsRequest || '').searchParams.get('filter')).toBe(
    'commentCard',
  )
})

test('getBoardDetail requests lists and cards', async () => {
  const requests: string[] = []
  const client = createTrelloClient(async (url) => {
    requests.push(url)
    if (url.includes('/boards/board-1/lists')) {
      return jsonResponse([{ id: 'list-1', name: 'Todo' }])
    }
    return jsonResponse([
      {
        badges: {
          comments: 3,
        },
        cover: {
          scaled: [{ url: 'https://example.com/cover.png' }],
        },
        id: 'card-1',
        idBoard: 'board-1',
        idList: 'list-1',
        labels: [
          {
            color: 'blue',
            id: 'label-1',
            idBoard: 'board-1',
            name: 'Extension Api',
          },
        ],
        name: 'Ship Trello view',
      },
    ])
  })

  await expect(
    client.getBoardDetail(
      { id: 'board-1', name: 'Roadmap' },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    board: { id: 'board-1', name: 'Roadmap' },
    lists: [
      {
        cards: [
          {
            badges: {
              comments: 3,
            },
            cover: {
              scaled: [{ url: 'https://example.com/cover.png' }],
            },
            id: 'card-1',
            idBoard: 'board-1',
            idList: 'list-1',
            labels: [
              {
                color: 'blue',
                id: 'label-1',
                idBoard: 'board-1',
                name: 'Extension Api',
              },
            ],
            name: 'Ship Trello view',
          },
        ],
        id: 'list-1',
        name: 'Todo',
      },
    ],
  })

  expect(requests.map((request) => new URL(request).pathname)).toEqual([
    '/1/boards/board-1/lists',
    '/1/lists/list-1/cards',
  ])
  const cardsUrl = new URL(requests[1])
  expect(cardsUrl.searchParams.get('fields')).toBe(
    'name,url,idBoard,idList,badges,cover,labels',
  )
  expect(cardsUrl.searchParams.get('attachments')).toBe('cover')
  expect(cardsUrl.searchParams.get('attachment_fields')).toBe(
    'name,url,mimeType,previews',
  )
})

test('getCardDetail requests card detail, attachments, and comments', async () => {
  const requests: string[] = []
  const client = createTrelloClient(async (url) => {
    requests.push(url)
    if (url.includes('/cards/card-1/attachments')) {
      return jsonResponse([
        {
          id: 'attachment-1',
          mimeType: 'image/png',
          name: 'Screenshot',
          previews: [{ url: 'https://example.com/preview.png' }],
          url: 'https://example.com/screenshot.png',
        },
      ])
    }
    if (url.includes('/cards/card-1/actions')) {
      return jsonResponse([
        {
          data: {
            text: 'This should show under the description.',
          },
          date: '2026-07-03T10:11:00.000Z',
          id: 'comment-1',
          memberCreator: {
            avatarHash: 'avatar-hash-1',
            avatarUrl: 'https://trello-members.example/avatar.png',
            fullName: 'Test User',
            initials: 'TU',
            username: 'testuser',
          },
          type: 'commentCard',
        },
      ])
    }
    return jsonResponse({
      desc: 'Detailed card description',
      id: 'card-1',
      idBoard: 'board-1',
      idList: 'list-1',
      labels: [
        {
          color: 'blue',
          id: 'label-1',
          idBoard: 'board-1',
          name: 'Extension Api',
        },
      ],
      name: 'Ship Trello view',
      url: 'https://trello.com/c/card-1',
    })
  })

  await expect(
    client.getCardDetail(
      { id: 'card-1', name: 'Ship Trello view' },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    attachments: [
      {
        id: 'attachment-1',
        mimeType: 'image/png',
        name: 'Screenshot',
        previews: [{ url: 'https://example.com/preview.png' }],
        url: 'https://example.com/screenshot.png',
      },
    ],
    card: {
      desc: 'Detailed card description',
      id: 'card-1',
      idBoard: 'board-1',
      idList: 'list-1',
      labels: [
        {
          color: 'blue',
          id: 'label-1',
          idBoard: 'board-1',
          name: 'Extension Api',
        },
      ],
      name: 'Ship Trello view',
      url: 'https://trello.com/c/card-1',
    },
    comments: [
      {
        data: {
          text: 'This should show under the description.',
        },
        date: '2026-07-03T10:11:00.000Z',
        id: 'comment-1',
        memberCreator: {
          avatarHash: 'avatar-hash-1',
          avatarUrl: 'https://trello-members.example/avatar.png',
          fullName: 'Test User',
          initials: 'TU',
          username: 'testuser',
        },
        type: 'commentCard',
      },
    ],
  })

  expect(requests.map((request) => new URL(request).pathname)).toEqual([
    '/1/cards/card-1',
    '/1/cards/card-1/attachments',
    '/1/cards/card-1/actions',
  ])
  const cardRequest = requests.find((request) => {
    return new URL(request).pathname === '/1/cards/card-1'
  })
  const attachmentsRequest = requests.find((request) => {
    return new URL(request).pathname === '/1/cards/card-1/attachments'
  })
  const commentsRequest = requests.find((request) => {
    return new URL(request).pathname === '/1/cards/card-1/actions'
  })
  expect(cardRequest).toBeDefined()
  expect(attachmentsRequest).toBeDefined()
  expect(commentsRequest).toBeDefined()
  expect(new URL(cardRequest || '').searchParams.get('fields')).toBe(
    'name,desc,url,idBoard,idList,labels',
  )
  expect(new URL(attachmentsRequest || '').searchParams.get('fields')).toBe(
    'name,url,mimeType,previews',
  )
  expect(new URL(commentsRequest || '').searchParams.get('filter')).toBe(
    'commentCard',
  )
  expect(new URL(commentsRequest || '').searchParams.get('fields')).toBe(
    'data,date,id',
  )
  expect(new URL(commentsRequest || '').searchParams.get('memberCreator')).toBe(
    'true',
  )
  expect(
    new URL(commentsRequest || '').searchParams.get('memberCreator_fields'),
  ).toBe('avatarHash,avatarUrl,fullName,initials,username')
})

test('updateCard sends title and description to trello', async () => {
  const requests: string[] = []
  const requestInits: ({ readonly method?: string } | undefined)[] = []
  const client = createTrelloClient(async (url, init) => {
    requests.push(url)
    requestInits.push(init)
    return jsonResponse({
      desc: 'Updated description',
      id: 'card-1',
      idBoard: 'board-1',
      idList: 'list-1',
      name: 'Updated title',
      url: 'https://trello.com/c/card-1',
    })
  })

  await expect(
    client.updateCard(
      { id: 'card-1', name: 'Ship Trello view' },
      {
        desc: 'Updated description',
        name: 'Updated title',
      },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    desc: 'Updated description',
    id: 'card-1',
    idBoard: 'board-1',
    idList: 'list-1',
    name: 'Updated title',
    url: 'https://trello.com/c/card-1',
  })

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/cards/card-1')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('name')).toBe('Updated title')
  expect(url.searchParams.get('desc')).toBe('Updated description')
  expect(url.searchParams.get('fields')).toBe(
    'name,desc,url,idBoard,idList,badges,cover',
  )
  expect(requestInits[0]?.method).toBe('PUT')
})

test('moveCard sends target list and bottom position to trello', async () => {
  const requests: string[] = []
  const requestInits: ({ readonly method?: string } | undefined)[] = []
  const client = createTrelloClient(async (url, init) => {
    requests.push(url)
    requestInits.push(init)
    return jsonResponse({
      badges: {
        comments: 1,
      },
      id: 'card-1',
      idBoard: 'board-1',
      idList: 'list-2',
      name: 'Ship Trello view',
      url: 'https://trello.com/c/card-1',
    })
  })

  await expect(
    client.moveCard(
      { id: 'card-1', idList: 'list-1', name: 'Ship Trello view' },
      {
        idList: 'list-2',
        pos: 'bottom',
      },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    badges: {
      comments: 1,
    },
    id: 'card-1',
    idBoard: 'board-1',
    idList: 'list-2',
    name: 'Ship Trello view',
    url: 'https://trello.com/c/card-1',
  })

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/cards/card-1')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('idList')).toBe('list-2')
  expect(url.searchParams.get('pos')).toBe('bottom')
  expect(url.searchParams.get('fields')).toBe(
    'name,url,idBoard,idList,badges,cover',
  )
  expect(requestInits[0]?.method).toBe('PUT')
})

test('createCard sends target list, title, and bottom position to trello', async () => {
  const requests: string[] = []
  const requestInits: ({ readonly method?: string } | undefined)[] = []
  const client = createTrelloClient(async (url, init) => {
    requests.push(url)
    requestInits.push(init)
    return jsonResponse({
      badges: {
        comments: 0,
      },
      id: 'card-1',
      idBoard: 'board-1',
      idList: 'list-1',
      name: 'Build add card',
      url: 'https://trello.com/c/card-1',
    })
  })

  await expect(
    client.createCard(
      { cards: [], id: 'list-1', name: 'Todo' },
      {
        name: 'Build add card',
        pos: 'bottom',
      },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    badges: {
      comments: 0,
    },
    id: 'card-1',
    idBoard: 'board-1',
    idList: 'list-1',
    name: 'Build add card',
    url: 'https://trello.com/c/card-1',
  })

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/cards')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('idList')).toBe('list-1')
  expect(url.searchParams.get('name')).toBe('Build add card')
  expect(url.searchParams.get('pos')).toBe('bottom')
  expect(url.searchParams.get('fields')).toBe('name,url,idBoard,idList,badges')
  expect(requestInits[0]?.method).toBe('POST')
})

test('createCard invalidates cached cards for target list', async () => {
  const cache = createMemoryTrelloApiCache()
  const client = createTrelloClient(async (url) => {
    const path = new URL(url).pathname
    if (path === '/1/boards/board-1/lists') {
      return jsonResponse([{ id: 'list-1', name: 'Todo' }])
    }
    if (path === '/1/lists/list-1/cards') {
      return jsonResponse([
        {
          id: 'card-1',
          idList: 'list-1',
          name: 'Plan work',
        },
      ])
    }
    return jsonResponse({
      id: 'card-2',
      idList: 'list-1',
      name: 'Build add card',
    })
  }, cache)
  const credentials = {
    apiKey: validApiKey,
    token: validToken,
  }

  await client.getBoardDetail({ id: 'board-1', name: 'Roadmap' }, credentials)
  expect(
    cache.keys().some((key) => {
      return new URL(key).pathname === '/1/lists/list-1/cards'
    }),
  ).toBe(true)

  await client.createCard(
    { cards: [], id: 'list-1', name: 'Todo' },
    {
      name: 'Build add card',
      pos: 'bottom',
    },
    credentials,
  )

  expect(
    cache.keys().some((key) => {
      return new URL(key).pathname === '/1/lists/list-1/cards'
    }),
  ).toBe(false)
})

test('listBoardLabels requests board labels with credentials', async () => {
  const requests: string[] = []
  const client = createTrelloClient(async (url) => {
    requests.push(url)
    return jsonResponse([
      {
        color: 'blue',
        id: 'label-1',
        idBoard: 'board-1',
        name: 'Extension Api',
      },
    ])
  })

  await expect(
    client.listBoardLabels(
      { id: 'board-1', name: 'Roadmap' },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual([
    {
      color: 'blue',
      id: 'label-1',
      idBoard: 'board-1',
      name: 'Extension Api',
    },
  ])

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/boards/board-1/labels')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('fields')).toBe('name,color,idBoard')
  expect(url.searchParams.get('limit')).toBe('1000')
})

test('addCardLabel sends label id to trello', async () => {
  const requests: string[] = []
  const requestInits: ({ readonly method?: string } | undefined)[] = []
  const client = createTrelloClient(async (url, init) => {
    requests.push(url)
    requestInits.push(init)
    return jsonResponse({
      id: 'card-1',
      labels: [
        {
          color: 'blue',
          id: 'label-1',
          idBoard: 'board-1',
          name: 'Extension Api',
        },
      ],
      name: 'Ship Trello view',
    })
  })

  await expect(
    client.addCardLabel(
      { id: 'card-1', name: 'Ship Trello view' },
      {
        color: 'blue',
        id: 'label-1',
        idBoard: 'board-1',
        name: 'Extension Api',
      },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    id: 'card-1',
    labels: [
      {
        color: 'blue',
        id: 'label-1',
        idBoard: 'board-1',
        name: 'Extension Api',
      },
    ],
    name: 'Ship Trello view',
  })

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/cards/card-1/idLabels')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('value')).toBe('label-1')
  expect(requestInits[0]?.method).toBe('POST')
})

test('addCardComment sends comment text to trello', async () => {
  const requests: string[] = []
  const requestInits: ({ readonly method?: string } | undefined)[] = []
  const client = createTrelloClient(async (url, init) => {
    requests.push(url)
    requestInits.push(init)
    return jsonResponse({
      data: {
        text: 'Looks good',
      },
      id: 'comment-1',
    })
  })

  await expect(
    client.addCardComment(
      { id: 'card-1', name: 'Ship Trello view' },
      'Looks good',
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    data: {
      text: 'Looks good',
    },
    id: 'comment-1',
  })

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/cards/card-1/actions/comments')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('text')).toBe('Looks good')
  expect(requestInits[0]?.method).toBe('POST')
})

test('addCardLabel invalidates cached card detail', async () => {
  const cache = createMemoryTrelloApiCache()
  const client = createTrelloClient(async (url) => {
    const path = new URL(url).pathname
    if (path === '/1/cards/card-1/attachments') {
      return jsonResponse([])
    }
    if (path === '/1/cards/card-1/actions') {
      return jsonResponse([])
    }
    return jsonResponse({
      id: 'card-1',
      labels: [],
      name: 'Ship Trello view',
    })
  }, cache)
  const credentials = {
    apiKey: validApiKey,
    token: validToken,
  }

  await client.getCardDetail(
    { id: 'card-1', name: 'Ship Trello view' },
    credentials,
  )
  expect(
    cache.keys().some((key) => {
      return new URL(key).pathname === '/1/cards/card-1'
    }),
  ).toBe(true)

  await client.addCardLabel(
    { id: 'card-1', name: 'Ship Trello view' },
    { color: 'blue', id: 'label-1', name: 'Extension Api' },
    credentials,
  )

  expect(
    cache.keys().some((key) => {
      return new URL(key).pathname === '/1/cards/card-1'
    }),
  ).toBe(false)
})

test('updateList sends title to trello', async () => {
  const requests: string[] = []
  const requestInits: ({ readonly method?: string } | undefined)[] = []
  const client = createTrelloClient(async (url, init) => {
    requests.push(url)
    requestInits.push(init)
    return jsonResponse({
      id: 'list-1',
      name: 'Updated list',
    })
  })

  await expect(
    client.updateList(
      { cards: [], id: 'list-1', name: 'Todo' },
      {
        name: 'Updated list',
      },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    cards: [],
    id: 'list-1',
    name: 'Updated list',
  })

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/lists/list-1')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('name')).toBe('Updated list')
  expect(url.searchParams.get('fields')).toBe('name')
  expect(requestInits[0]?.method).toBe('PUT')
})

test('createList sends title and board to trello', async () => {
  const requests: string[] = []
  const requestInits: ({ readonly method?: string } | undefined)[] = []
  const client = createTrelloClient(async (url, init) => {
    requests.push(url)
    requestInits.push(init)
    return jsonResponse({
      id: 'list-1',
      name: 'Done',
    })
  })

  await expect(
    client.createList(
      { id: 'board-1', name: 'Roadmap' },
      {
        name: 'Done',
        pos: 'bottom',
      },
      {
        apiKey: validApiKey,
        token: validToken,
      },
    ),
  ).resolves.toEqual({
    cards: [],
    id: 'list-1',
    name: 'Done',
  })

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/lists')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('idBoard')).toBe('board-1')
  expect(url.searchParams.get('name')).toBe('Done')
  expect(url.searchParams.get('pos')).toBe('bottom')
  expect(url.searchParams.get('fields')).toBe('name')
  expect(requestInits[0]?.method).toBe('POST')
})

test('search requests trello search with card and board params', async () => {
  const requests: string[] = []
  const client = createTrelloClient(async (url) => {
    requests.push(url)
    return jsonResponse({
      boards: [{ id: 'board-1', name: 'Roadmap' }],
      cards: [{ id: 'card-1', idBoard: 'board-1', name: 'Ship search' }],
    })
  })

  await expect(
    client.search('ship', {
      apiKey: validApiKey,
      token: validToken,
    }),
  ).resolves.toEqual([
    { id: 'card-1', idBoard: 'board-1', name: 'Ship search', type: 'card' },
    { id: 'board-1', name: 'Roadmap', type: 'board' },
  ])

  expect(requests).toHaveLength(1)
  const url = new URL(requests[0])
  expect(url.pathname).toBe('/1/search')
  expect(url.searchParams.get('key')).toBe(validApiKey)
  expect(url.searchParams.get('token')).toBe(validToken)
  expect(url.searchParams.get('query')).toBe('ship')
  expect(url.searchParams.get('modelTypes')).toBe('cards,boards')
  expect(url.searchParams.get('card_fields')).toBe('name,url,idBoard')
  expect(url.searchParams.get('board_fields')).toBe('name,url,prefs')
  expect(url.searchParams.get('cards_limit')).toBe('10')
  expect(url.searchParams.get('boards_limit')).toBe('10')
})

test('listBoards throws useful errors for failed requests', async () => {
  const client = createTrelloClient(async () => {
    return new Response('unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
    })
  })

  await expect(
    client.listBoards({
      apiKey: 'bad-key',
      token: 'bad-token',
    }),
  ).rejects.toThrow(new Error('Trello request failed: 401 unauthorized'))
})

test('search throws useful errors for failed requests', async () => {
  const client = createTrelloClient(async () => {
    return new Response('unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
    })
  })

  await expect(
    client.search('ship', {
      apiKey: 'bad-key',
      token: 'bad-token',
    }),
  ).rejects.toThrow(new Error('Trello request failed: 401 unauthorized'))
})
