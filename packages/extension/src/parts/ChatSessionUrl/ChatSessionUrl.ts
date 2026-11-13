const legacyChatTaskHashPrefix = '#chat-'
const chatPathRegex = /(?:^|\/)chat\/?$/
const boardPathRegex = /(?:^|\/)board\/?$/
const layoutPathSuffixRegex = /\/(?:chat|board)\/?$/

export type ChatTaskHash =
  | { readonly id: string; readonly type: 'task' }
  | { readonly type: 'invalid' | 'none' }

export const getUrl = (href: string): URL | undefined => {
  if (!URL.canParse(href)) {
    return undefined
  }
  return new URL(href)
}

export const getChatTaskHash = (id: string): string => {
  return `#${encodeURIComponent(id)}`
}

export const isChatPath = (pathname: string): boolean => {
  return chatPathRegex.test(pathname)
}

export const isBoardPath = (pathname: string): boolean => {
  return boardPathRegex.test(pathname)
}

export const getChatPath = (href: string, assetDir: string): string => {
  const currentUrl = new URL(href)
  const assetPath = new URL(assetDir, currentUrl).pathname
  const pathPrefix = assetPath.slice(0, assetPath.lastIndexOf('/'))
  return pathPrefix ? `${pathPrefix}/chat` : '/chat'
}

export const getBoardPath = (href: string, assetDir: string): string => {
  const currentUrl = new URL(href)
  const assetPath = new URL(assetDir, currentUrl).pathname
  const pathPrefix = assetPath.slice(0, assetPath.lastIndexOf('/'))
  return pathPrefix ? `${pathPrefix}/board` : '/board'
}

export const getIdePath = (href: string): string => {
  const currentUrl = new URL(href)
  const path = currentUrl.pathname
  if (!isChatPath(path) && !isBoardPath(path)) {
    return path
  }
  const withoutLayout = path.replace(layoutPathSuffixRegex, '')
  return withoutLayout ? `${withoutLayout}/` : '/'
}

export const parseChatTaskHash = (href: string): ChatTaskHash => {
  if (!URL.canParse(href)) {
    return { type: 'none' }
  }
  const { hash, pathname } = new URL(href)
  const legacy = hash.startsWith(legacyChatTaskHashPrefix)
  if (!hash) {
    return { type: 'none' }
  }
  if (!isChatPath(pathname) && !legacy) {
    return { type: 'none' }
  }
  const encodedId = legacy
    ? hash.slice(legacyChatTaskHashPrefix.length)
    : hash.slice(1)
  try {
    const id = decodeURIComponent(encodedId)
    return id ? { id, type: 'task' } : { type: 'invalid' }
  } catch {
    return { type: 'invalid' }
  }
}
