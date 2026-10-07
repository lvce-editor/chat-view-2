const chatTaskHashPrefix = '#chat-'

export type ChatTaskHash =
  | { readonly id: string; readonly type: 'task' }
  | { readonly type: 'invalid' | 'none' }

export const getChatTaskHash = (id: string): string => {
  return `${chatTaskHashPrefix}${encodeURIComponent(id)}`
}

export const parseChatTaskHash = (href: string): ChatTaskHash => {
  if (!URL.canParse(href)) {
    return { type: 'none' }
  }
  const { hash } = new URL(href)
  if (!hash.startsWith(chatTaskHashPrefix)) {
    return { type: 'none' }
  }
  try {
    const id = decodeURIComponent(hash.slice(chatTaskHashPrefix.length))
    return id ? { id, type: 'task' } : { type: 'invalid' }
  } catch {
    return { type: 'invalid' }
  }
}
