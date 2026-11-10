import type { ChatImageAttachment } from '../ChatApi/ChatApi.ts'

const cacheName = 'chat-view-2-images-v1'
const cachePath = '/__chat_view_2_images__/'

const getImageResponse = (image: ChatImageAttachment): Response => {
  const separator = image.dataUrl.indexOf(',')
  if (separator === -1) {
    throw new TypeError('Invalid image data URL')
  }
  const metadata = image.dataUrl.slice(0, separator)
  const content = image.dataUrl.slice(separator + 1)
  const bytes = metadata.endsWith(';base64')
    ? Uint8Array.from(
        atob(content),
        (character) => character.codePointAt(0) || 0,
      )
    : new TextEncoder().encode(decodeURIComponent(content))
  return new Response(new Blob([bytes], { type: image.mimeType }))
}

const getCacheUrl = async (dataUrl: string): Promise<string> => {
  const bytes = new TextEncoder().encode(dataUrl)
  let hash: string
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  } catch {
    hash = [...bytes]
      .reduce(
        (value, byte) => Math.imul(value ^ byte, 16_777_619) >>> 0,
        2_166_136_261,
      )
      .toString(16)
  }
  const baseUrl =
    typeof location === 'undefined'
      ? 'https://chat-view-2.invalid'
      : location.href
  return new URL(`${cachePath}${hash}`, baseUrl).href
}

export interface ChatImageCache {
  readonly dispose: () => void
  readonly resolve: (image: ChatImageAttachment) => Promise<ChatImageAttachment>
  readonly retain: (images: readonly ChatImageAttachment[]) => void
}

export const createChatImageCache = (): ChatImageCache => {
  const objectUrls = new Map<string, string>()
  const pending = new Map<string, Promise<ChatImageAttachment>>()
  let disposed = false

  const resolve = async (
    image: ChatImageAttachment,
  ): Promise<ChatImageAttachment> => {
    const existingUrl = objectUrls.get(image.dataUrl)
    if (existingUrl) {
      return { ...image, objectUrl: existingUrl }
    }
    const inProgress = pending.get(image.dataUrl)
    if (inProgress) {
      return { ...image, ...(await inProgress) }
    }
    const promise = (async (): Promise<ChatImageAttachment> => {
      try {
        const cacheUrl = await getCacheUrl(image.dataUrl)
        let cache: Cache | undefined
        try {
          cache =
            typeof caches === 'undefined'
              ? undefined
              : await caches.open(cacheName)
        } catch {
          cache = undefined
        }
        let cachedResponse: Response | undefined
        try {
          cachedResponse = await cache?.match(cacheUrl)
        } catch {
          cachedResponse = undefined
        }
        let blob: Blob
        if (cachedResponse) {
          blob = await cachedResponse.blob()
        } else {
          const response = getImageResponse(image)
          blob = await response.blob()
        }
        if (!cachedResponse) {
          try {
            await cache?.put(
              cacheUrl,
              new Response(blob, {
                headers: { 'Content-Type': image.mimeType },
              }),
            )
          } catch {
            // Rendering remains available when Cache Storage is unavailable.
          }
        }
        if (disposed) {
          return image
        }
        const objectUrl = URL.createObjectURL(blob)
        objectUrls.set(image.dataUrl, objectUrl)
        return { ...image, objectUrl }
      } finally {
        pending.delete(image.dataUrl)
      }
    })()
    pending.set(image.dataUrl, promise)
    return promise
  }

  return {
    dispose(): void {
      disposed = true
      for (const objectUrl of objectUrls.values()) {
        URL.revokeObjectURL(objectUrl)
      }
      objectUrls.clear()
    },
    resolve,
    retain(images): void {
      const retainedDataUrls = new Set(images.map((image) => image.dataUrl))
      for (const [dataUrl, objectUrl] of objectUrls) {
        if (retainedDataUrls.has(dataUrl)) {
          continue
        }

        URL.revokeObjectURL(objectUrl)
        objectUrls.delete(dataUrl)
      }
    },
  }
}
