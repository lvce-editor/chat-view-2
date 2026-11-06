const activeTasks = new Set<string>()
const lockName = (id: string): string => `lvce-chat-2-task:${id}`

type TaskExecutionResult<T> =
  | { readonly acquired: false }
  | { readonly acquired: true; readonly value: T }

export const isTaskExecuting = async (id: string): Promise<boolean> => {
  if (activeTasks.has(id)) return true
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

export const tryWithTaskExecution = async <T>(
  id: string,
  run: () => Promise<T>,
): Promise<TaskExecutionResult<T>> => {
  const execute = async (): Promise<TaskExecutionResult<T>> => {
    if (activeTasks.has(id)) return { acquired: false }
    activeTasks.add(id)
    try {
      return { acquired: true, value: await run() }
    } finally {
      activeTasks.delete(id)
    }
  }
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(
      lockName(id),
      { ifAvailable: true },
      async (lock) => (lock ? execute() : { acquired: false }),
    )
  }
  return execute()
}

export const withTaskExecution = async <T>(
  id: string,
  run: () => Promise<T>,
): Promise<T> => {
  if (activeTasks.has(id))
    throw new Error('This conversation already has an active turn.')
  const result = await tryWithTaskExecution(id, run)
  if (!result.acquired)
    throw new Error('This conversation is running in another window.')
  return result.value
}
