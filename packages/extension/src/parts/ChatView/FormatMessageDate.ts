const ranges = [
  { divisor: 1, limit: 60, unit: 'second' },
  { divisor: 60, limit: 60 * 60, unit: 'minute' },
  { divisor: 60 * 60, limit: 60 * 60 * 24, unit: 'hour' },
  { divisor: 60 * 60 * 24, limit: 60 * 60 * 24 * 7, unit: 'day' },
  { divisor: 60 * 60 * 24 * 7, limit: 60 * 60 * 24 * 30, unit: 'week' },
  { divisor: 60 * 60 * 24 * 30, limit: 60 * 60 * 24 * 365, unit: 'month' },
  { divisor: 60 * 60 * 24 * 365, limit: Infinity, unit: 'year' },
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
  const range = ranges.find(({ limit }) => seconds < limit)!
  const value = Math.floor(seconds / range.divisor)
  const relative = `${value} ${range.unit}${value === 1 ? '' : 's'}`
  return now >= time ? `${relative} ago` : `in ${relative}`
}
