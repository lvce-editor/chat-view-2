/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, unicorn/prefer-iterator-to-array */
import type { ChatTask } from '../ChatApi/ChatApi.ts'

export interface TaskStore {
  readonly archive: (id: string) => Promise<void>
  readonly get: (id: string) => Promise<ChatTask | undefined>
  readonly list: (limit: number) => Promise<readonly ChatTask[]>
  readonly rename: (id: string, title: string) => Promise<ChatTask | undefined>
  readonly save: (task: ChatTask) => Promise<void>
}

export const createMemoryTaskStore = (
  initialTasks: readonly ChatTask[] = [],
): TaskStore => {
  const tasks = new Map(initialTasks.map((task) => [task.id, task]))
  return {
    async archive(id) {
      const task = tasks.get(id)
      if (task) {
        tasks.set(id, { ...task, archived: true })
      }
    },
    async get(id) {
      return tasks.get(id)
    },
    async list(limit) {
      return [...tasks.values()]
        .filter((task) => !task.archived)
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, Math.max(0, limit))
    },
    async rename(id, title) {
      const task = tasks.get(id)
      if (!task || task.archived) {
        return undefined
      }
      const renamed = {
        ...task,
        title,
        titleGenerated: true,
        updatedAt: new Date().toISOString(),
      }
      tasks.set(id, renamed)
      return renamed
    },
    async save(task) {
      const existing = tasks.get(task.id)
      tasks.set(task.id, {
        ...task,
        ...(existing?.archived && { archived: true }),
        ...(existing?.titleGenerated && {
          title: existing.title,
          titleGenerated: true,
        }),
      })
    },
  }
}

const databaseName = 'lvce-chat-2'
const storeName = 'tasks'
export const taskStoreChannelName = 'lvce-chat-2-task-store'

const taskChangeChannel =
  typeof indexedDB === 'undefined' || typeof BroadcastChannel === 'undefined'
    ? undefined
    : new BroadcastChannel(taskStoreChannelName)

const publishTaskChange = (): void => {
  taskChangeChannel?.postMessage({ type: 'tasks-changed' })
}

const openDatabase = (): Promise<IDBDatabase> => {
  const { promise, reject, resolve } = Promise.withResolvers<IDBDatabase>()
  const request = indexedDB.open(databaseName, 1)
  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName, { keyPath: 'id' })
    }
  }
  return promise
}

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  const { promise, reject, resolve } = Promise.withResolvers<T>()
  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
  return promise
}

const transactionToPromise = (transaction: IDBTransaction): Promise<void> => {
  const { promise, reject, resolve } = Promise.withResolvers<void>()
  transaction.oncomplete = () => resolve()
  transaction.onerror = () => reject(transaction.error)
  transaction.onabort = () => reject(transaction.error)
  return promise
}

export const createIndexedDbTaskStore = (): TaskStore => {
  if (typeof indexedDB === 'undefined') {
    return createMemoryTaskStore()
  }
  return {
    async archive(id) {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(storeName, 'readwrite')
        const transactionPromise = transactionToPromise(transaction)
        try {
          const store = transaction.objectStore(storeName)
          const task = await requestToPromise<ChatTask | undefined>(
            store.get(id),
          )
          if (task) {
            await requestToPromise(store.put({ ...task, archived: true }))
          }
          await transactionPromise
          if (task) {
            publishTaskChange()
          }
        } catch (error) {
          try {
            await transactionPromise
          } catch {
            // Preserve the request error that caused the transaction to abort.
          }
          throw error
        }
      } finally {
        database.close()
      }
    },
    async get(id) {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(storeName, 'readonly')
        const result = await requestToPromise<ChatTask | undefined>(
          transaction.objectStore(storeName).get(id),
        )
        return result
      } finally {
        database.close()
      }
    },
    async list(limit) {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(storeName, 'readonly')
        const tasks = await requestToPromise<ChatTask[]>(
          transaction.objectStore(storeName).getAll(),
        )
        return tasks
          .filter((task) => !task.archived)
          .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, Math.max(0, limit))
      } finally {
        database.close()
      }
    },
    async rename(id, title) {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        const task = await requestToPromise<ChatTask | undefined>(store.get(id))
        if (!task || task.archived) {
          return undefined
        }
        const renamed = {
          ...task,
          title,
          titleGenerated: true,
          updatedAt: new Date().toISOString(),
        }
        await requestToPromise(store.put(renamed))
        return renamed
      } finally {
        database.close()
      }
    },
    async save(task) {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(storeName, 'readwrite')
        const transactionPromise = transactionToPromise(transaction)
        try {
          const store = transaction.objectStore(storeName)
          const existing = await requestToPromise<ChatTask | undefined>(
            store.get(task.id),
          )
          await requestToPromise(
            store.put({
              ...task,
              ...(existing?.archived && { archived: true }),
              ...(existing?.titleGenerated && {
                title: existing.title,
                titleGenerated: true,
              }),
            }),
          )
          await transactionPromise
          publishTaskChange()
        } catch (error) {
          try {
            await transactionPromise
          } catch {
            // Preserve the request error that caused the transaction to abort.
          }
          throw error
        }
      } finally {
        database.close()
      }
    },
  }
}
