const activeTasks = new Set<string>()
const lockName = (id: string): string => `lvce-chat-2-task:${id}`

export const isTaskExecuting = async (id: string): Promise<boolean> => {
  if (activeTasks.has(id)) {
    return true
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    const locks = await navigator.locks.query()
    return (
      locks.held?.some(
        (lock: Readonly<LockInfo>) => lock.name === lockName(id),
      ) === true
    )
  }
  return false
}

export const withTaskExecution = async <T>(
  id: string,

  run: () => Promise<T>,
): Promise<T> => {
  const execute = async (): Promise<T> => {
    if (activeTasks.has(id)) {
      throw new Error('This conversation already has an active turn.')
    }
    activeTasks.add(id)
    try {
      return await run()
    } finally {
      activeTasks.delete(id)
    }
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(
      lockName(id),
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          throw new Error('This conversation is running in another window.')
        }
        return execute()
      },
    )
  }
  return execute()
}
