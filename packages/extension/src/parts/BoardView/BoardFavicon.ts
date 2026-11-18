const imageContentTypePattern = /^image\/(?:png|jpeg|webp|avif|gif)$/u

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')

export interface FaviconBackground {
  readonly bottomColor?: string | undefined
  readonly color?: string | undefined
  readonly image?: string | undefined
  readonly tiled?: boolean | undefined
  readonly topColor?: string | undefined
}

const loadImage = async (
  url: string,
  signal: Readonly<AbortSignal>,
  request: typeof fetch,
): Promise<string | undefined> => {
  try {
    const response = await request(url, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    })
    const mime = response.headers.get('content-type')?.split(';', 1)[0]
    if (!response.ok || !mime || !imageContentTypePattern.test(mime))
      return undefined
    const reader = response.body?.getReader()
    if (!reader) return undefined
    let binary = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (binary.length + value.length > 1_000_000) {
          await reader.cancel()
          return undefined
        }
        for (const byte of value) binary += String.fromCodePoint(byte)
      }
    } finally {
      reader.releaseLock()
    }
    return binary ? `data:${mime};base64,${btoa(binary)}` : undefined
  } catch {
    signal.throwIfAborted()
    return undefined
  }
}

// Trello's board icon uses a rounded background with two white list columns.
// Embed photos so the favicon remains self-contained in SVG image mode.
export const createBoardFavicon = async (
  background: FaviconBackground,
  signal: Readonly<AbortSignal>,
  request: typeof fetch = fetch,
): Promise<string> => {
  const { bottomColor, color, image, tiled, topColor } = background
  const photo = image ? await loadImage(image, signal, request) : undefined
  const gradient = topColor && bottomColor
  const fill = gradient ? 'url(#gradient)' : escapeXml(color || '#0055cc')
  const rounded = 'M19 0H45Q64 0 64 19V45Q64 64 45 64H19Q0 64 0 45V19Q0 0 19 0Z'
  const gradientNode = gradient
    ? `<linearGradient id="gradient" gradientUnits="userSpaceOnUse" x2="51" y2="74"><stop stop-color="${escapeXml(topColor)}"/><stop offset="1" stop-color="${escapeXml(bottomColor)}"/></linearGradient>`
    : ''
  const imageSize = tiled
    ? ''
    : 'width="64" height="64" preserveAspectRatio="xMinYMin slice"'
  const imageNode = photo
    ? `<image href="${photo}" ${imageSize} clip-path="url(#clip)"/>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><clipPath id="clip"><path d="${rounded}"/></clipPath>${gradientNode}</defs><path d="${rounded}" fill="${fill}"/>${imageNode}<g fill="white"><rect x="12" y="12" width="16" height="37" rx="4"/><rect x="36" y="12" width="16" height="23" rx="4"/></g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
