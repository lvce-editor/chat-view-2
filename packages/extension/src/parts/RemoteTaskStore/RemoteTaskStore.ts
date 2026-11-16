/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import type { ChatTask } from '../ChatApi/ChatApi.ts'
import type { TaskStore } from '../TaskStore/TaskStore.ts'
import { createIndexedDbTaskStore } from '../TaskStore/TaskStore.ts'

interface Options {
  readonly accessToken: string
  readonly baseUrl: string
  readonly createLocalStore?: (name?: string) => TaskStore
  readonly fetch?: typeof globalThis.fetch
  readonly refreshAccessToken?: () => Promise<string>
}
interface Account {
  readonly enabled: boolean
  readonly userId: string
}
interface Result {
  readonly revision?: number
  readonly task?: ChatTask
  readonly tasks?: readonly ChatTask[]
}

const trailingSlash = /\/$/u

export const createAccountTaskStore = async ({
  accessToken,
  baseUrl,
  createLocalStore = createIndexedDbTaskStore,
  fetch: request = globalThis.fetch,
  refreshAccessToken,
}: Options): Promise<TaskStore> => {
  if (!accessToken) return createLocalStore()
  const root = `${baseUrl.replace(trailingSlash, '')}/api/chat-storage`
  let token = accessToken
  const identity: { owner?: string } = {}
  const authenticated = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const send = (): Promise<Response> =>
      request(`${root}${path}`, {
        ...init,
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(identity.owner && { 'X-Chat-Account': identity.owner }),
        },
      })
    let response = await send()
    if (response.status === 401 && refreshAccessToken) {
      token = await refreshAccessToken()
      // Validate the refreshed identity before retrying any content-bearing request.
      if (identity.owner) {
        const accountResponse = await request(root, {
          credentials: 'omit',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Chat-Account': identity.owner,
          },
        })
        const account = (await accountResponse.json()) as Account
        if (!accountResponse.ok || account.userId !== identity.owner)
          throw new Error(
            'Chat account changed. Reopen chat before continuing.',
          )
        if (!account.enabled && init.method && init.method !== 'GET')
          throw new Error(
            'Chat storage was disabled. Your unsynced copy is kept on this device.',
          )
      }
      response = await send()
    }
    return response
  }
  // Never upload anonymous local history, nor probe custom OpenAI providers.
  const configuration = await authenticated('')
  if (configuration.status === 404) return createLocalStore()
  if (!configuration.ok)
    throw new Error(
      'Unable to read chat storage settings. Retry after signing in.',
    )
  const account = (await configuration.json()) as Account
  if (!account.enabled) return createLocalStore()
  if (typeof account.userId !== 'string' || !account.userId)
    throw new Error('Invalid chat storage account')
  const owner = account.userId
  identity.owner = owner
  const localOnly = createLocalStore()
  const recovery = createLocalStore(`lvce-chat-2-recovery-${owner}`)
  const recoveryIds = new Map<string, string>()
  const recoveryId = (id: string): string => {
    if (id.startsWith('unsynced-')) return id
    let copy = recoveryIds.get(id)
    if (!copy) {
      copy = `unsynced-${crypto.randomUUID()}`
      recoveryIds.set(id, copy)
    }
    return copy
  }
  const locallyRunning = new Set<string>()
  const revisions = new Map<string, Map<number, number>>()
  const aliases = (id: string): Map<number, number> => {
    let values = revisions.get(id)
    if (!values) {
      values = new Map()
      revisions.set(id, values)
    }
    return values
  }
  const remember = (task: ChatTask): ChatTask => {
    // Another browser cannot own this process's live execution. Show its durable
    // conversation as resumable without writing a synthetic interruption remotely.
    return ['running', 'stopping'].includes(task.status) &&
      !locallyRunning.has(task.id)
      ? { ...task, status: 'interrupted' }
      : task
  }
  const advance = (id: string, from: number, to: number): void => {
    if (from !== to) aliases(id).set(from, to)
  }
  const resolveRevision = (id: string, base: number): number => {
    const links = aliases(id)
    const path: number[] = []
    let current = base
    while (links.has(current)) {
      path.push(current)
      current = links.get(current)!
    }
    // Compress only acknowledged writes from this client; observed remote heads
    // never bridge a gap and cannot authorize overwriting another device's work.
    for (const revision of path) links.set(revision, current)
    return current
  }

  const enabled = async (): Promise<boolean> => {
    const response = await authenticated('')
    if (!response.ok)
      throw new Error(
        'Unable to read chat storage settings. Your unsynced copy is kept on this device.',
      )
    const current = (await response.json()) as Account
    if (current.userId !== owner)
      throw new Error('Chat account changed. Reopen chat before continuing.')
    return current.enabled
  }
  const call = async (path: string, init?: RequestInit): Promise<Result> => {
    const response = await authenticated(path, init)
    if (response.status === 404) return {}
    const result = (await response.json()) as Result & {
      readonly error?: string
    }
    if (!response.ok)
      throw new Error(
        result.error ||
          'Chat could not be synced. Your unsynced copy is kept on this device.',
      )
    return result
  }
  // Serializing this instance also protects overlapping title generation and turn saves.
  let pending: Promise<unknown> = Promise.resolve()
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = pending
    const result = (async (): Promise<T> => {
      await previous
      return operation()
    })()
    pending = (async (): Promise<void> => {
      try {
        await result
      } catch {
        /* Keep the queue usable after a failed sync. */
      }
    })()
    return result
  }
  return {
    archive: (id) =>
      serial(async () => {
        if (!(await enabled())) return localOnly.archive(id)
        const local = await recovery.get(id)
        if (local && !local.archived) return recovery.archive(id)
        const result = await call(`/chats/${encodeURIComponent(id)}`, {
          body: JSON.stringify({ action: 'archive' }),
          method: 'POST',
        })
        if (result.task) {
          advance(
            id,
            result.task.storageRevision! - 1,
            result.task.storageRevision!,
          )
        }
      }),
    get: (id) =>
      serial(async () => {
        if (!(await enabled())) return localOnly.get(id)
        const local = await recovery.get(id)
        if (local && !local.archived) return local
        const { task } = await call(`/chats/${encodeURIComponent(id)}`)
        return task && remember(task)
      }),
    list: (limit) =>
      serial(async () => {
        if (!(await enabled())) return localOnly.list(limit)
        const boundedLimit = Math.max(0, Math.min(100, Math.trunc(limit)))
        const { tasks = [] } = await call(`/chats?limit=${boundedLimit}`)
        const unsynced = await recovery.list(limit)
        const remoteIds = new Set(tasks.map((task) => task.id))
        return [
          ...tasks.map(remember),
          ...unsynced.filter((task) => !remoteIds.has(task.id)),
        ]
          .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, Math.max(0, limit))
      }),
    rename: (id, title, onlyIfNotGenerated = false) =>
      serial(async () => {
        if (!(await enabled()))
          return localOnly.rename(id, title, onlyIfNotGenerated)
        const local = await recovery.get(id)
        if (local && !local.archived)
          return recovery.rename(id, title, onlyIfNotGenerated)
        const { task } = await call(`/chats/${encodeURIComponent(id)}`, {
          body: JSON.stringify({ action: 'rename', onlyIfNotGenerated, title }),
          method: 'POST',
        })
        if (task) {
          advance(id, task.storageRevision! - 1, task.storageRevision!)
        }
        return task
      }),
    save: (task) =>
      serial(async () => {
        if (['running', 'stopping'].includes(task.status))
          locallyRunning.add(task.id)
        else locallyRunning.delete(task.id)
        // Keep a durable, account-isolated recovery copy before the network request.
        const copyId = recoveryId(task.id)
        await recovery.save({
          ...task,
          archived: false,
          id: copyId,
          status: 'interrupted',
          storageRevision: 0,
          title: `Unsynced copy: ${task.title}`,
          titleGenerated: false,
          updatedAt: new Date().toISOString(),
        })
        if (!(await enabled())) {
          await localOnly.save(task)
          await recovery.remove?.(copyId)
          recoveryIds.delete(task.id)
          return
        }
        const revision = resolveRevision(task.id, task.storageRevision || 0)
        const result = await call(`/chats/${encodeURIComponent(task.id)}`, {
          body: JSON.stringify({ action: 'save', revision, task }),
          method: 'POST',
        })
        if (typeof result.revision !== 'number')
          throw new Error('Invalid chat storage acknowledgement')
        advance(task.id, revision, result.revision)
        await recovery.remove?.(copyId)
        recoveryIds.delete(task.id)
      }),
  }
}
