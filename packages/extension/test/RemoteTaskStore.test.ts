/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, unicorn/no-await-expression-member */
import { expect, jest, test } from '@jest/globals'
import type { ChatTask } from '../src/parts/ChatApi/ChatApi.ts'
import type { TaskStore } from '../src/parts/TaskStore/TaskStore.ts'
import { createAccountTaskStore } from '../src/parts/RemoteTaskStore/RemoteTaskStore.ts'
import { createMemoryTaskStore } from '../src/parts/TaskStore/TaskStore.ts'

const unsyncedPattern = /^unsynced-/u
const task = (text = 'hello', revision?: number): ChatTask => ({
  createdAt: '2026-11-16T00:00:00.000Z',
  events: [
    {
      id: 'message',
      text,
      timestamp: '2026-11-16T00:00:00.000Z',
      type: 'user-message',
    },
  ],
  id: 'one',
  modelId: 'test',
  status: 'completed',
  title: 'Chat',
  updatedAt: '2026-11-16T00:00:00.000Z',
  ...(revision !== undefined && { storageRevision: revision }),
})
// The mock implements both task and configuration endpoints.

const setup = () => {
  const localStores = new Map<string, TaskStore>()
  const createLocalStore = (name = 'local'): TaskStore => {
    let store = localStores.get(name)
    if (!store) {
      store = createMemoryTaskStore()
      localStores.set(name, store)
    }
    return store
  }
  const account = { enabled: true, userId: 'alice' }
  const saved = new Map<string, ChatTask>()
  let failSave = false
  // eslint-disable-next-line sonarjs/cognitive-complexity
  const fetch = jest.fn<typeof globalThis.fetch>(async (url, init) => {
    const path = (url as string).replace(
      'https://backend.test/api/chat-storage',
      '',
    )
    if (!path) return Response.json(account)
    const id = path.split('/').at(-1)!
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string)
      if (body.action === 'save') {
        if (failSave) throw new Error('Disconnected')
        if (body.revision !== (saved.get(id)?.storageRevision || 0))
          return Response.json(
            { error: 'Chat changed on another device' },
            { status: 409 },
          )
        const revision = body.revision + 1
        saved.set(id, { ...body.task, storageRevision: revision })
        return Response.json({ revision })
      }
      const current = saved.get(id)
      if (!current) return new Response(null, { status: 404 })
      const updated = {
        ...current,
        ...(body.action === 'archive'
          ? { archived: true }
          : { title: body.title, titleGenerated: true }),
        storageRevision: current.storageRevision! + 1,
      }
      saved.set(id, updated)
      return Response.json({ revision: updated.storageRevision, task: updated })
    }
    if (path.startsWith('/chats?'))
      return Response.json({
        tasks: saved
          .values()
          .filter((value) => !value.archived)
          .toArray(),
      })
    return saved.has(id)
      ? Response.json({ task: saved.get(id) })
      : new Response(null, { status: 404 })
  })
  const options = {
    accessToken: 'token',
    baseUrl: 'https://backend.test',
    createLocalStore,
    fetch,
  }
  return {
    account,
    createLocalStore,
    fetch,
    localStores,
    options,
    saved,
    setFailSave: (value: boolean) => {
      failSave = value
    },
  }
}

test('disabled and anonymous accounts keep local storage without uploading history', async () => {
  const state = setup()
  state.account.enabled = false
  const local = state.createLocalStore()
  await local.save(task())
  const store = await createAccountTaskStore(state.options)
  expect(store).toBe(local)
  await store.save(task('local'))
  expect(state.fetch).toHaveBeenCalledTimes(1)
  state.fetch.mockClear()
  await createAccountTaskStore({ ...state.options, accessToken: '' })
  expect(state.fetch).not.toHaveBeenCalled()
})

test('a fresh device loads the conversation and images without uploading old local chats', async () => {
  const state = setup()
  await state.createLocalStore().save({ ...task(), id: 'old-local' })
  const first = await createAccountTaskStore(state.options)
  const imageTask = {
    ...task(),
    events: [
      {
        ...task().events[0],
        attachments: [
          {
            dataUrl: 'data:image/png;base64,YQ==',
            mimeType: 'image/png',
            name: 'image.png',
          },
        ],
      },
    ],
  } as ChatTask
  await first.save(imageTask)
  const second = await createAccountTaskStore(state.options)
  expect((await second.get('one'))?.events).toEqual(imageTask.events)
  expect((await second.list(20)).map((value) => value.id)).toEqual(['one'])
  expect(state.saved.has('old-local')).toBe(false)
})

test('successive saves advance the original task revision and serialize rename operations', async () => {
  const state = setup()
  const store = await createAccountTaskStore(state.options)
  await store.save(task())
  await store.save(task('second'))
  await Promise.all([store.rename('one', 'Custom'), store.save(task('third'))])
  expect(state.saved.get('one')?.storageRevision).toBe(4)
})

test('a newer GET does not allow an old task to overwrite another device', async () => {
  const state = setup()
  const store = await createAccountTaskStore(state.options)
  await store.save(task())
  const old = (await store.get('one'))!
  state.saved.set('one', task('other device', 2))
  await store.get('one')
  await expect(
    store.save({ ...old, events: task('stale').events }),
  ).rejects.toThrow('another device')
  expect(state.saved.get('one')?.events).toEqual(task('other device').events)
  const fresh = await createAccountTaskStore(state.options)
  const recovery = (await fresh.list(20)).find((value) =>
    value.id.startsWith('unsynced-'),
  )!
  expect(recovery.title).toBe('Unsynced copy: Chat')
  expect((await fresh.get(recovery.id))?.events).toEqual(task('stale').events)
})

test('interrupted network writes preserve a visible recovery copy across instances', async () => {
  const state = setup()
  const store = await createAccountTaskStore(state.options)
  state.setFailSave(true)
  await expect(store.save(task())).rejects.toThrow('Disconnected')
  const fresh = await createAccountTaskStore(state.options)
  const copies = await fresh.list(20)
  expect(copies).toHaveLength(1)
  expect(copies[0]?.id).toMatch(unsyncedPattern)
  state.setFailSave(false)
  await fresh.save((await fresh.get(copies[0].id))!)
  expect(state.saved.get(copies[0].id)?.events).toEqual(task().events)
})

test('disabling storage while open stops uploads and account switches fail closed', async () => {
  const state = setup()
  const store = await createAccountTaskStore(state.options)
  state.account.enabled = false
  await store.save(task())
  expect(state.saved.size).toBe(0)
  state.account.enabled = true
  state.account.userId = 'bob'
  await expect(store.save(task())).rejects.toThrow('account changed')
  expect(state.saved.size).toBe(0)
})

test('remote running chats become resumable without writing remote state on reads', async () => {
  const state = setup()
  state.saved.set('one', { ...task('in progress', 1), status: 'running' })
  const store = await createAccountTaskStore(state.options)
  expect((await store.get('one'))?.status).toBe('interrupted')
  expect(state.saved.get('one')?.status).toBe('running')
  await store.save({ ...task('own run', 1), status: 'running' })
  expect((await store.get('one'))?.status).toBe('running')
})

test('acknowledged recovery snapshots are removed instead of accumulating on disk', async () => {
  const state = setup()
  const store = await createAccountTaskStore(state.options)
  const recovery = state.localStores.get('lvce-chat-2-recovery-alice')!
  const saved = jest.spyOn(recovery, 'save')
  await store.save(task())
  const copyId = saved.mock.calls[0][0].id
  expect(await recovery.get(copyId)).toBeUndefined()
})

test('token refresh cannot retry chat content under a different account', async () => {
  const state = setup()
  const original = state.options.fetch
  let posts = 0
  const store = await createAccountTaskStore({
    ...state.options,
    fetch: async (url, init) => {
      if (init?.method === 'POST') {
        posts++
        return new Response(null, { status: 401 })
      }
      return original(url, init)
    },
    refreshAccessToken: async () => {
      state.account.userId = 'bob'
      return 'bob-token'
    },
  })
  await expect(store.save(task())).rejects.toThrow('account changed')
  expect(posts).toBe(1)
  expect(state.saved.size).toBe(0)
})
