import { expect, test, jest } from '@jest/globals'
import { createChatImageCache } from '../src/parts/ChatImageCache/ChatImageCache.ts'

const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')

const restoreCaches = (): void => {
  if (originalCaches) {
    Object.defineProperty(globalThis, 'caches', originalCaches)
  } else {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: undefined,
    })
  }
}

test('caches image blobs and reuses an object URL until disposal', async () => {
  const entries = new Map<string, Response>()
  const put = jest.fn(async (key: string, response: Response) => {
    entries.set(key, response)
  })
  const match = jest.fn(async (key: string) => entries.get(key))
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open: async () => ({ match, put }) },
  })
  const createObjectUrl = jest
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:chat-image')
  const revokeObjectUrl = jest
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})
  const imageCache = createChatImageCache()
  const image = {
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    mimeType: 'image/png',
    name: 'Generated image.png',
  }

  try {
    await expect(imageCache.resolve(image)).resolves.toEqual({
      ...image,
      objectUrl: 'blob:chat-image',
    })
    expect(put).toHaveBeenCalledTimes(1)
    expect(await entries.values().next().value?.blob()).toMatchObject({
      type: 'image/png',
    })
    await expect(imageCache.resolve(image)).resolves.toHaveProperty(
      'objectUrl',
      'blob:chat-image',
    )
    expect(createObjectUrl).toHaveBeenCalledTimes(1)
    imageCache.retain([])
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:chat-image')
    imageCache.dispose()
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
  } finally {
    imageCache.dispose()
    createObjectUrl.mockRestore()
    revokeObjectUrl.mockRestore()
    restoreCaches()
  }
})

test('creates a URL for a cached image without downloading its data URL again', async () => {
  const image = {
    dataUrl: 'data:image/webp;base64,aGVsbG8=',
    mimeType: 'image/webp',
    name: 'Generated image.webp',
  }
  const cachedBlob = new Blob(['cached'], { type: 'image/webp' })
  const match = jest.fn(async () => new Response(cachedBlob))
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { open: async () => ({ match, put: jest.fn() }) },
  })
  const fetch = jest.spyOn(globalThis, 'fetch')
  const createObjectUrl = jest
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:cached-image')
  const imageCache = createChatImageCache()

  try {
    await expect(imageCache.resolve(image)).resolves.toHaveProperty(
      'objectUrl',
      'blob:cached-image',
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(createObjectUrl).toHaveBeenCalledWith(cachedBlob)
  } finally {
    imageCache.dispose()
    fetch.mockRestore()
    createObjectUrl.mockRestore()
    restoreCaches()
  }
})
