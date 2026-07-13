/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/prefer-promise-reject-errors, @typescript-eslint/prefer-readonly-parameter-types, unicorn/prefer-iterator-to-array */
import type { ChatTask } from '../ChatApi/ChatApi.ts'

export interface TaskStore {
  readonly get: (id: string) => Promise<ChatTask | undefined>
  readonly list: (limit: number) => Promise<readonly ChatTask[]>
  readonly save: (task: ChatTask) => Promise<void>
}

export const createMemoryTaskStore = (
  initialTasks: readonly ChatTask[] = [],
): TaskStore => {
  const tasks = new Map(initialTasks.map((task) => [task.id, task]))
  return {
    async get(id) {
      return tasks.get(id)
    },
    async list(limit) {
      return [...tasks.values()]
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, Math.max(0, limit))
    },
    async save(task) {
      tasks.set(task.id, task)
    },
  }
}

const databaseName = 'lvce-chat-2'
const storeName = 'tasks'

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
    }
  })
}

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

export const createIndexedDbTaskStore = (): TaskStore => {
  if (typeof indexedDB === 'undefined') {
    return createMemoryTaskStore()
  }
  return {
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
        await requestToPromise(transaction.objectStore(storeName).put(task))
      } finally {
        database.close()
      }
    },
  }
}
