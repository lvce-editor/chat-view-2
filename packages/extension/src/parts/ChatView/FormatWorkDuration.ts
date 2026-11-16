import type { ChatTask, ChatTaskEvent } from '../ChatApi/ChatApi.ts'

const durationRanges = [
  [60, 'second', 1],
  [60 * 60, 'minute', 60],
  [60 * 60 * 24, 'hour', 60 * 60],
  [60 * 60 * 24 * 7, 'day', 60 * 60 * 24],
  [60 * 60 * 24 * 30, 'week', 60 * 60 * 24 * 7],
  [60 * 60 * 24 * 365, 'month', 60 * 60 * 24 * 30],
  [Infinity, 'year', 60 * 60 * 24 * 365],
] as const

const isTerminalStatus = (event: ChatTaskEvent): boolean => {
  return (
    event.type === 'status' &&
    ['completed', 'failed', 'stopped', 'interrupted', 'idle'].includes(
      event.status,
    )
  )
}

const getTimestamp = (timestamp: string | undefined): number | undefined => {
  if (!timestamp) {
    return undefined
  }
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : undefined
}

export const getWorkDurationSeconds = (
  task: ChatTask,
  now = Date.now(),
): number => {
  const startEvent = task.events.findLast(
    (event) => event.type === 'status' && event.status === 'running',
  )
  const startIndex = startEvent ? task.events.indexOf(startEvent) : -1
  const fallbackStartEvent = task.events.findLast(
    (event) => event.type === 'user-message',
  )
  const startAt =
    getTimestamp(startEvent?.timestamp) ??
    getTimestamp(fallbackStartEvent?.timestamp) ??
    getTimestamp(task.createdAt) ??
    now
  const isWorking = task.status === 'running' || task.status === 'stopping'
  let endAt = now

  if (!isWorking) {
    const terminalEvent = startEvent
      ? task.events.slice(startIndex + 1).find(isTerminalStatus)
      : undefined
    const lastResponseEvent = task.events.findLast(
      (event) =>
        event.type === 'assistant-message' ||
        event.type === 'error' ||
        isTerminalStatus(event),
    )
    endAt =
      getTimestamp(terminalEvent?.timestamp) ??
      getTimestamp(lastResponseEvent?.timestamp) ??
      startAt
  }

  return Math.max(0, Math.floor((endAt - startAt) / 1000))
}

export const formatWorkDuration = (seconds: number): string => {
  const duration = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0
  const [, unit, divisor] =
    durationRanges.find(([limit]) => duration < limit) ?? durationRanges.at(-1)!
  const value = Math.floor(duration / divisor)
  return `${value} ${unit}${value === 1 ? '' : 's'}`
}
