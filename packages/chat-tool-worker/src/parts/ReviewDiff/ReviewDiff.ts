const maximumPreviewLength = 16_000

export const createReviewDiff = (
  path: string,
  before: string,
  after: string,
): string => {
  if (before === after) {
    return ''
  }
  const previous = before ? before.split('\n') : []
  const current = after ? after.split('\n') : []
  let start = 0
  while (
    start < previous.length &&
    start < current.length &&
    previous[start] === current[start]
  ) {
    start++
  }
  let previousEnd = previous.length
  let currentEnd = current.length
  while (
    previousEnd > start &&
    currentEnd > start &&
    previous[previousEnd - 1] === current[currentEnd - 1]
  ) {
    previousEnd--
    currentEnd--
  }
  const removed = previousEnd - start
  const added = currentEnd - start
  let result = `--- a/${path}\n+++ b/${path}\n@@ -${start + (removed ? 1 : 0)},${removed} +${start + (added ? 1 : 0)},${added} @@\n`
  for (const [lines, end, prefix] of [
    [previous, previousEnd, '-'],
    [current, currentEnd, '+'],
  ] as const) {
    for (let index = start; index < end; index++) {
      const line = `${prefix}${lines[index]}\n`
      if (result.length + line.length > maximumPreviewLength) {
        return `${result}${line.slice(0, Math.max(0, maximumPreviewLength - result.length))}\nDiff preview truncated.`
      }
      result += line
    }
  }
  return result
}
