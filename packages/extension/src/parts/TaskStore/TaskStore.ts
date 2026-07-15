/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-readonly-parameter-types, unicorn/prefer-iterator-to-array */
import type { ChatTask } from '../ChatApi/ChatApi.ts'

export interface TaskStore {
  readonly archive: (id: string) => Promise<void>
  readonly get: (id: string) => Promise<ChatTask | undefined>
  readonly list: (limit: number) => Promise<readonly ChatTask[]>
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
    async save(task) {
      const archived = tasks.get(task.id)?.archived
      tasks.set(task.id, archived ? { ...task, archived: true } : task)
    },
  }
}

const databaseName = 'lvce-chat-2'
const storeName = 'tasks'

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

export const createIndexedDbTaskStore = (): TaskStore => {
  if (typeof indexedDB === 'undefined') {
    return createMemoryTaskStore()
  }
  return {
    async archive(id) {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        const task = await requestToPromise<ChatTask | undefined>(store.get(id))
        if (task) {
          await requestToPromise(store.put({ ...task, archived: true }))
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
    async save(task) {
      const database = await openDatabase()
      try {
        const transaction = database.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        const existing = await requestToPromise<ChatTask | undefined>(
          store.get(task.id),
        )
        await requestToPromise(
          store.put(existing?.archived ? { ...task, archived: true } : task),
        )
      } finally {
        database.close()
      }
    },
  }
}
