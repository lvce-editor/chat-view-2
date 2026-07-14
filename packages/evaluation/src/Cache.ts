/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecordedHttpResponse } from './Types.ts'

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    )
  }
  return value
}

export const createCacheKey = (request: unknown): string => {
  return createHash('sha256')
    .update(JSON.stringify(sortJson(request)))
    .digest('hex')
}

const getCachePath = (cacheDirectory: string, key: string): string => {
  return join(cacheDirectory, `${key}.json`)
}

export const readCachedResponse = async (
  cacheDirectory: string,
  key: string,
): Promise<RecordedHttpResponse | undefined> => {
  try {
    return JSON.parse(
      await readFile(getCachePath(cacheDirectory, key), 'utf8'),
    ) as RecordedHttpResponse
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

export const writeCachedResponse = async (
  cacheDirectory: string,
  key: string,
  response: RecordedHttpResponse,
): Promise<void> => {
  await mkdir(cacheDirectory, { recursive: true })
  const path = getCachePath(cacheDirectory, key)
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(response, undefined, 2)}\n`)
  await rename(temporaryPath, path)
}
