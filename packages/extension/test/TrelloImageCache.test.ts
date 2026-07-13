import { expect, test } from '@jest/globals'
import {
  createTrelloImageCache,
  testTrelloImageCacheName,
} from '../src/parts/TrelloImageCache/TrelloImageCache.ts'

const imageUrl = 'https://example.com/card-cover.png'

const createPngResponse = (value: string): Response => {
  return new Response(value, {
    headers: {
      'content-type': 'image/png',
    },
    status: 200,
  })
}

const createMemoryCacheStorage = (
  initialValues: Readonly<Record<string, Response>> = {},
): {
  readonly cacheStorage: CacheStorage
  readonly putUrls: readonly string[]
} => {
  const values = new Map<string, Response>(Object.entries(initialValues))
  const putUrls: string[] = []
  const cache = {
    async match(url: string): Promise<Response | undefined> {
      return values.get(url)?.clone()
    },
    async put(url: string, response: Response): Promise<void> {
      putUrls.push(url)
      values.set(url, response.clone())
    },
  } as unknown as Cache
  const cacheStorage = {
    async open(cacheName: string): Promise<Cache> {
      expect(cacheName).toBe(testTrelloImageCacheName)
      return cache
    },
  } as unknown as CacheStorage
  return { cacheStorage, putUrls }
}

test('resolveImageUrl fetches, caches, and returns object url on cache miss', async () => {
  const { cacheStorage, putUrls } = createMemoryCacheStorage()
  const fetchUrls: string[] = []
  const imageCache = createTrelloImageCache(
    cacheStorage,
    async (url): Promise<Response> => {
      fetchUrls.push(url)
      return createPngResponse('fresh image')
    },
    testTrelloImageCacheName,
  )

  const objectUrl = await imageCache.resolveImageUrl(imageUrl)

  expect(objectUrl.startsWith('blob:')).toBe(true)
  expect(fetchUrls).toEqual([imageUrl])
  expect(putUrls).toEqual([imageUrl])
  imageCache.dispose()
})

test('resolveImageUrl reads Cache Storage before fetching', async () => {
  const { cacheStorage, putUrls } = createMemoryCacheStorage({
    [imageUrl]: createPngResponse('cached image'),
  })
  const imageCache = createTrelloImageCache(
    cacheStorage,
    async (): Promise<Response> => {
      throw new Error('Expected cached image to be used')
    },
    testTrelloImageCacheName,
  )

  const objectUrl = await imageCache.resolveImageUrl(imageUrl)

  expect(objectUrl.startsWith('blob:')).toBe(true)
  expect(putUrls).toEqual([])
  imageCache.dispose()
})

test('resolveImageUrl fails closed for non-ok image responses', async () => {
  const { cacheStorage, putUrls } = createMemoryCacheStorage()
  const imageCache = createTrelloImageCache(
    cacheStorage,
    async (): Promise<Response> => {
      return new Response('not found', {
        status: 404,
      })
    },
    testTrelloImageCacheName,
  )

  await expect(imageCache.resolveImageUrl(imageUrl)).resolves.toBe('')
  expect(putUrls).toEqual([])
  imageCache.dispose()
})
