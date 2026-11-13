import type { ViewContext } from '@lvce-editor/api'
import { expect, jest, test } from '@jest/globals'
import { createSession } from '../src/parts/BoardView/BoardSession.ts'
import {
  createInstance,
  type BoardHost,
} from '../src/parts/BoardView/BoardView.ts'
import { render } from '../src/parts/BoardView/Render.ts'
import { TrelloError, type TrelloBoard } from '../src/parts/BoardView/Trello.ts'

const board: TrelloBoard = {
  cards: [
    { desc: 'Details', id: 'one', idList: 'todo', name: 'A task', pos: 1 },
  ],
  id: 'board',
  lists: [
    { id: 'todo', name: 'Todo', pos: 1 },
    { id: 'empty', name: 'Empty', pos: 2 },
  ],
  name: 'Work',
}
const createHost = (): BoardHost => ({
  authorize: jest
    .fn<BoardHost['authorize']>()
    .mockResolvedValue(
      'https://backend.test/auth/trello/connect?ticket=one-use',
    ),
  execute: jest.fn<BoardHost['execute']>().mockResolvedValue(undefined),
  load: jest.fn<BoardHost['load']>().mockResolvedValue(board),
  read: jest.fn<BoardHost['read']>().mockResolvedValue([]),
  revoke: jest.fn<BoardHost['revoke']>().mockResolvedValue(undefined),
  session: createSession(),
  status: jest
    .fn<BoardHost['status']>()
    .mockResolvedValue({ configured: true, connected: true }),
  updateCard: jest
    .fn<BoardHost['updateCard']>()
    .mockImplementation(async (id, name, desc) => ({
      desc,
      id,
      idList: 'todo',
      name,
      pos: 1,
    })),
  write: jest.fn<BoardHost['write']>().mockResolvedValue(undefined),
})
const createContext = (): ViewContext => ({
  requestRerender: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  showContextMenu: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  uid: 1,
  viewId: 'chat2.views.board',
})
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

test('shows setup, renders empty lists and saves only board IDs', async () => {
  const host = createHost()
  const context = createContext()
  const view = await createInstance(context, host)
  expect(JSON.stringify(await view.render())).toContain('Connect Trello')
  expect(JSON.stringify(await view.render())).not.toContain('Trello API key')
  await view.handleEvent?.({ name: 'board-provider:trello', type: 'click' })
  await flush()
  expect(JSON.stringify(await view.render())).toContain('Board URL or ID')
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '5k8NLHLh',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  const dom = JSON.stringify(await view.render())
  expect(dom).toContain('A task')
  expect(dom).toContain('No cards')
  expect(host.write).toHaveBeenCalledWith('chat2.connectedBoardIds', [
    '5k8NLHLh',
  ])
  await view.handleEvent?.({ name: 'board-change', type: 'click' })
  expect(JSON.stringify(await view.render())).toContain('Connect Trello')
  expect(JSON.stringify(await view.render())).not.toContain('Trello API key')
  expect(JSON.stringify(view.saveState?.())).not.toContain('private')
  expect(dom).not.toContain('private')
  expect(context.requestRerender).toHaveBeenCalled()
})

test('stale completion and disposed requests cannot replace current state', async () => {
  const host = createHost()
  const first = Promise.withResolvers<TrelloBoard>()
  const second = Promise.withResolvers<TrelloBoard>()
  jest
    .mocked(host.load)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
  const context = createContext()
  const view = await createInstance(context, host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '11111111',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '22222222',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  second.resolve({ ...board, name: 'Current' })
  await flush()
  first.resolve({ ...board, name: 'Stale' })
  await flush()
  expect(JSON.stringify(await view.render())).toContain('Current')
  expect(JSON.stringify(await view.render())).not.toContain('Stale')
  expect(host.write).toHaveBeenCalledTimes(1)
  expect(jest.mocked(host.load).mock.calls[0]?.[1].aborted).toBe(true)
  const pending = Promise.withResolvers<TrelloBoard>()
  jest.mocked(host.load).mockReturnValueOnce(pending.promise)
  await view.handleEvent?.({ name: 'board-refresh', type: 'click' })
  view.dispose?.()
  const notifications = jest.mocked(context.requestRerender).mock.calls.length
  pending.resolve({ ...board, name: 'Disposed' })
  await flush()
  expect(jest.mocked(context.requestRerender).mock.calls).toHaveLength(
    notifications,
  )
})

test('shows readable failure and recovers on retry', async () => {
  const host = createHost()
  jest.mocked(host.load).mockRejectedValueOnce(
    new TrelloError({
      code: 'TRELLO_SERVER_ERROR',
      message: 'Try again shortly.',
    }),
  )
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '5k8NLHLh',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  expect(JSON.stringify(await view.render())).toContain('TRELLO_SERVER_ERROR')
  await view.handleEvent?.({ name: 'board-retry', type: 'click' })
  await flush()
  expect(JSON.stringify(await view.render())).toContain('A task')
  expect(JSON.stringify(await view.render())).not.toContain(
    'TRELLO_SERVER_ERROR',
  )
})

test('restores remembered IDs, never credentials, and disconnects', async () => {
  const host = createHost()
  jest.mocked(host.read).mockResolvedValue(['5k8NLHLh'])
  const view = await createInstance(createContext(), host)
  expect(JSON.stringify(await view.render())).toContain('Connect Trello')
  await view.handleEvent?.({ name: 'board-provider:trello', type: 'click' })
  expect(JSON.stringify(await view.render())).toContain('5k8NLHLh')
  expect(host.load).not.toHaveBeenCalled()
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  await view.handleEvent?.({ name: 'board-disconnect', type: 'click' })
  expect(host.write).toHaveBeenLastCalledWith('chat2.connectedBoardIds', [])
  expect(JSON.stringify(await view.render())).toContain('Connect Trello')
})

test('groups cards without dropping empty columns', () => {
  const dom = render({
    accountConnected: true,
    board,
    boardId: '5k8NLHLh',
    connectedIds: [],
    error: undefined,
    loading: false,
    providerSelected: false,
  })
  expect(dom.filter((node) => node.className === 'BoardColumn')).toHaveLength(2)
  expect(
    dom.filter((node) => node.className === 'BoardCardButton'),
  ).toHaveLength(1)
})

test('opens a card editor and updates the board only after Trello confirms the save', async () => {
  const host = createHost()
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '5k8NLHLh',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  await view.handleEvent?.({ name: 'board-card:one', type: 'click' })
  expect(JSON.stringify(await view.render())).toContain('Edit card')
  expect(JSON.stringify(await view.render())).toContain('Details')
  await view.handleEvent?.({
    name: 'edit-card-name',
    type: 'input',
    value: 'Renamed',
  })
  await view.handleEvent?.({
    name: 'edit-card-desc',
    type: 'input',
    value: 'New details',
  })
  await view.handleEvent?.({ name: 'board-card-edit', type: 'submit' })
  await flush()
  expect(host.updateCard).toHaveBeenCalledWith(
    'one',
    'Renamed',
    'New details',
    expect.anything(),
  )
  const dom = JSON.stringify(await view.render())
  expect(dom).toContain('Renamed')
  expect(dom).not.toContain('Edit card')
  expect(host.session.get('5k8NLHLh')?.board.cards[0]).toMatchObject({
    desc: 'New details',
    name: 'Renamed',
  })
})

test('retains the draft after a failed card save and lets users retry or cancel', async () => {
  const host = createHost()
  jest.mocked(host.updateCard).mockRejectedValueOnce(
    new TrelloError({
      code: 'TRELLO_ACCESS_DENIED',
      message: 'Reconnect Trello and allow board editing.',
    }),
  )
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '5k8NLHLh',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  await view.handleEvent?.({ name: 'board-card:one', type: 'click' })
  await view.handleEvent?.({
    name: 'edit-card-name',
    type: 'input',
    value: 'Draft title',
  })
  await view.handleEvent?.({ name: 'board-card-edit', type: 'submit' })
  await flush()
  const failedDom = JSON.stringify(await view.render())
  expect(failedDom).toContain('Draft title')
  expect(failedDom).toContain('Reconnect Trello and allow board editing.')
  expect(failedDom).toContain('Edit card')
  expect(host.session.get('5k8NLHLh')?.board.cards[0]?.name).toBe('A task')
  await view.handleEvent?.({ name: 'board-card-cancel', type: 'click' })
  expect(JSON.stringify(await view.render())).not.toContain('Edit card')
  await view.handleEvent?.({ name: 'board-card:one', type: 'click' })
  const oldFocusContext = view.getContext?.() || {}
  view.handleDialogKeyDown('Escape')
  expect(JSON.stringify(await view.render())).not.toContain('Edit card')
  expect(view.renderFocus?.(oldFocusContext, view.getContext?.() || {})).toBe(
    '[name="board-card:one"]',
  )
})

test('keeps connected boards across layout changes without saving credentials', async () => {
  const host = createHost()
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: 'https://trello.com/b/5k8NLHLh/work',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  view.dispose?.()
  jest.mocked(host.read).mockResolvedValue(['5k8NLHLh'])
  const restored = await createInstance(createContext(), host)
  expect(JSON.stringify(await restored.render())).toContain('A task')
  await restored.handleEvent?.({ name: 'board-refresh', type: 'click' })
  await flush()
  expect(host.load).toHaveBeenLastCalledWith('5k8NLHLh', expect.anything())
  await restored.handleEvent?.({ name: 'board-disconnect', type: 'click' })
  expect(host.write).toHaveBeenLastCalledWith('chat2.connectedBoardIds', [])
  expect(host.session.get('5k8NLHLh')).toBeUndefined()
})

test('offers browser authorization and cancels polling when the view is disposed', async () => {
  const host = createHost()
  jest
    .mocked(host.status)
    .mockResolvedValue({ configured: true, connected: false })
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({ name: 'board-provider:trello', type: 'click' })
  await flush()
  expect(JSON.stringify(await view.render())).toContain('Authorize Trello')
  expect(JSON.stringify(await view.render())).not.toContain('Board URL or ID')
  await view.handleEvent?.({ name: 'board-authorize', type: 'click' })
  await flush()
  const dom = JSON.stringify(await view.render())
  expect(dom).toContain('Continue to Trello')
  expect(dom).toContain('Waiting for Trello authorization')
  expect(JSON.stringify(view.saveState?.())).not.toContain('one-use')
  const signal = jest.mocked(host.authorize).mock.calls[0][0]
  view.dispose?.()
  expect(signal.aborted).toBe(true)
  await flush()
})

test('disconnects the Trello account and clears all cached boards', async () => {
  const host = createHost()
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '5k8NLHLh',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  await view.handleEvent?.({ name: 'board-disconnect-account', type: 'click' })
  await flush()
  expect(host.revoke).toHaveBeenCalledTimes(1)
  expect(host.session.get('5k8NLHLh')).toBeUndefined()
  expect(JSON.stringify(await view.render())).toContain('Authorize Trello')
  expect(JSON.stringify(await view.render())).not.toContain('A task')
})

test('an expired Trello connection offers authorization again', async () => {
  const host = createHost()
  jest.mocked(host.load).mockRejectedValue(
    new TrelloError({
      code: 'TRELLO_CONNECTION_REQUIRED',
      message: 'Connect Trello again.',
    }),
  )
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '5k8NLHLh',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  expect(JSON.stringify(await view.render())).toContain('Authorize Trello')
})

test('updates automatically when browser consent completes', async () => {
  jest.useFakeTimers()
  const host = createHost()
  jest
    .mocked(host.status)
    .mockResolvedValueOnce({ configured: true, connected: false })
  const view = await createInstance(createContext(), host)
  try {
    await view.handleEvent?.({ name: 'board-provider:trello', type: 'click' })
    await jest.advanceTimersByTimeAsync(0)
    await view.handleEvent?.({ name: 'board-authorize', type: 'click' })
    await Promise.resolve()
    expect(JSON.stringify(await view.render())).toContain('Continue to Trello')
    await jest.advanceTimersByTimeAsync(2000)
    const dom = JSON.stringify(await view.render())
    expect(dom).toContain('Board URL or ID')
    expect(dom).not.toContain('Continue to Trello')
    expect(dom).not.toContain('Waiting for Trello')
  } finally {
    view.dispose?.()
    jest.useRealTimers()
  }
})

test('opens remembered boards after reload without requesting Trello credentials', async () => {
  const host = createHost()
  jest.mocked(host.read).mockResolvedValue(['5k8NLHLh'])
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({ name: 'board-provider:trello', type: 'click' })
  await flush()
  await view.handleEvent?.({ name: 'board-select:5k8NLHLh', type: 'click' })
  await flush()
  expect(JSON.stringify(await view.render())).toContain('A task')
  expect(host.load).toHaveBeenCalledWith('5k8NLHLh', expect.anything())
})
