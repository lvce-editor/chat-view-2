const pending = new Map<string, Promise<unknown>>()

export const withFileMutation = async <T>(
  uri: string,

  mutate: () => Promise<T>,
  signal?: Readonly<AbortSignal>,
): Promise<T> => {
  const key = new URL(uri).href
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(
      `lvce-chat-file:${key}`,
      { ...(signal && { signal }) },
      mutate,
    )
  }
  const previous = pending.get(key) || Promise.resolve()
  const result = (async (): Promise<T> => {
    try {
      await previous
    } catch {
      /* A failed edit must not block later edits. */
    }
    signal?.throwIfAborted()
    return mutate()
  })()
  pending.set(key, result)
  try {
    return await result
  } finally {
    if (pending.get(key) === result) {
      pending.delete(key)
    }
  }
}
