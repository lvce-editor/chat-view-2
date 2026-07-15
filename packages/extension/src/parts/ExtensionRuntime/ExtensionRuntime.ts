interface ExtensionRuntimeContext {
  readonly isWeb?: boolean
  readonly path?: string
  readonly uri?: string
}

const trailingSlashRegex = /\/$/
const fileUriPrefix = 'file:'
const httpUriPrefixes = ['http://', 'https://'] as const
const remotePathPrefix = '/remote/'
const extensionEntrySuffix = '/dist/chatMain.js'
const developmentExtensionSuffix = '/packages/extension'

const state: {
  root: string
} = {
  root: '',
}

const isHttpUri = (value: string): boolean => {
  return httpUriPrefixes.some((prefix) => value.startsWith(prefix))
}

const fileUriToPath = (value: string): string => {
  try {
    return decodeURIComponent(new URL(value).pathname)
  } catch {
    return ''
  }
}

const removeExtensionEntrySuffix = (value: string): string => {
  return value.endsWith(extensionEntrySuffix)
    ? value.slice(0, -extensionEntrySuffix.length)
    : ''
}

const getFileSystemRootFromModuleUrl = (value: string): string => {
  try {
    const url = new URL(value)
    if (url.protocol === fileUriPrefix) {
      return removeExtensionEntrySuffix(fileUriToPath(value))
    }
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.pathname.startsWith(remotePathPrefix)
    ) {
      const remotePath = decodeURIComponent(
        url.pathname.slice(remotePathPrefix.length - 1),
      )
      return removeExtensionEntrySuffix(remotePath)
    }
  } catch {
    return ''
  }
  return ''
}

const getFileSystemRoot = (context: ExtensionRuntimeContext): string => {
  const path = typeof context.path === 'string' ? context.path : ''
  const uri = typeof context.uri === 'string' ? context.uri : ''
  if (isHttpUri(path) || isHttpUri(uri)) {
    return ''
  }
  if (context.isWeb === true) {
    if (!uri.startsWith(fileUriPrefix)) {
      return ''
    }
    return path || fileUriToPath(uri)
  }
  if (path) {
    return path
  }
  return uri.startsWith(fileUriPrefix) ? fileUriToPath(uri) : ''
}

export const setExtensionRuntime = (value: unknown): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return
  }
  const context = value as ExtensionRuntimeContext
  const root = getFileSystemRoot(context)
  state.root = root.replace(trailingSlashRegex, '')
}

export const setExtensionRuntimeFromModuleUrl = (value: string): void => {
  state.root = getFileSystemRootFromModuleUrl(value).replace(
    trailingSlashRegex,
    '',
  )
}

export const getComputerUseNodePath = (): string => {
  if (!state.root) {
    return ''
  }
  if (state.root.endsWith(developmentExtensionSuffix)) {
    return `${state.root.slice(0, -developmentExtensionSuffix.length)}/packages/node/src/computerUseClient.js`
  }
  return `${state.root}/node/src/computerUseClient.js`
}

export const resetExtensionRuntime = (): void => {
  state.root = ''
}
