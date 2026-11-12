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
  cards: [{ id: 'one', idList: 'todo', name: 'A task', pos: 1 }],
  id: 'board',
  lists: [
    { id: 'todo', name: 'Todo', pos: 1 },
    { id: 'empty', name: 'Empty', pos: 2 },
  ],
  name: 'Work',
}
const createHost = (): BoardHost => ({
  execute: jest.fn<BoardHost['execute']>().mockResolvedValue(undefined),
  load: jest.fn<BoardHost['load']>().mockResolvedValue(board),
  read: jest.fn<BoardHost['read']>().mockResolvedValue([]),
  session: createSession(),
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
  expect(JSON.stringify(await view.render())).toContain(
    'Connect a Trello board',
  )
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: '5k8NLHLh',
  })
  await view.handleEvent?.({
    name: 'board-api-key',
    type: 'input',
    value: 'private-key',
  })
  await view.handleEvent?.({
    name: 'board-token',
    type: 'input',
    value: 'private-token',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  const dom = JSON.stringify(await view.render())
  expect(dom).toContain('A task')
  expect(dom).toContain('No cards')
  expect(host.write).toHaveBeenCalledWith('chat2.connectedBoardIds', [
    '5k8NLHLh',
  ])
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
  expect(jest.mocked(host.load).mock.calls[0]?.[3].aborted).toBe(true)
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
  expect(JSON.stringify(await view.render())).toContain('5k8NLHLh')
  expect(host.load).not.toHaveBeenCalled()
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  await view.handleEvent?.({ name: 'board-disconnect', type: 'click' })
  expect(host.write).toHaveBeenLastCalledWith('chat2.connectedBoardIds', [])
  expect(JSON.stringify(await view.render())).toContain(
    'Connect a Trello board',
  )
})

test('groups cards without dropping empty columns', () => {
  const dom = render({
    board,
    boardId: '5k8NLHLh',
    connectedIds: [],
    error: undefined,
    loading: false,
  })
  expect(dom.filter((node) => node.className === 'BoardColumn')).toHaveLength(2)
  expect(dom.filter((node) => node.className === 'BoardCard')).toHaveLength(1)
})

test('keeps connected boards across layout changes without saving credentials', async () => {
  const host = createHost()
  const view = await createInstance(createContext(), host)
  await view.handleEvent?.({
    name: 'board-id',
    type: 'input',
    value: 'https://trello.com/b/5k8NLHLh/work',
  })
  await view.handleEvent?.({
    name: 'board-api-key',
    type: 'input',
    value: 'key',
  })
  await view.handleEvent?.({
    name: 'board-token',
    type: 'input',
    value: 'token',
  })
  await view.handleEvent?.({ name: 'board-connect', type: 'submit' })
  await flush()
  view.dispose?.()
  jest.mocked(host.read).mockResolvedValue(['5k8NLHLh'])
  const restored = await createInstance(createContext(), host)
  expect(JSON.stringify(await restored.render())).toContain('A task')
  await restored.handleEvent?.({ name: 'board-refresh', type: 'click' })
  await flush()
  expect(host.load).toHaveBeenLastCalledWith(
    '5k8NLHLh',
    'key',
    'token',
    expect.anything(),
  )
  await restored.handleEvent?.({ name: 'board-disconnect', type: 'click' })
  expect(host.write).toHaveBeenLastCalledWith('chat2.connectedBoardIds', [])
  expect(host.session.get('5k8NLHLh')).toBeUndefined()
})
