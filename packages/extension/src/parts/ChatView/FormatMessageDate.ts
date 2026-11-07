const ranges = [
  [60, 'second', 1],
  [60 * 60, 'minute', 60],
  [60 * 60 * 24, 'hour', 60 * 60],
  [60 * 60 * 24 * 7, 'day', 60 * 60 * 24],
  [60 * 60 * 24 * 30, 'week', 60 * 60 * 24 * 7],
  [60 * 60 * 24 * 365, 'month', 60 * 60 * 24 * 30],
  [Infinity, 'year', 60 * 60 * 24 * 365],
] as const

export const formatMessageDate = (
  timestamp: string,
  now = Date.now(),
): string => {
  const date = new Date(timestamp)
  const time = date.getTime()
  if (Number.isNaN(time)) {
    return timestamp
  }
  const seconds = Math.floor(Math.abs(now - time) / 1000)
  const [, unit, divisor] = ranges.find(([limit]) => seconds < limit)!
  const value = Math.floor(seconds / divisor)
  const relative = `${value} ${unit}${value === 1 ? '' : 's'}`
  return now >= time ? `${relative} ago` : `in ${relative}`
}
