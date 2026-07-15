interface ExtensionRuntimeContext {
  readonly isWeb?: boolean
  readonly path?: string
  readonly uri?: string
}

const trailingSlashRegex = /\/$/

const state: {
  isWeb: boolean
  root: string
} = {
  isWeb: false,
  root: '',
}

export const setExtensionRuntime = (value: unknown): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return
  }
  const context = value as ExtensionRuntimeContext
  const root = context.path || context.uri
  if (typeof root === 'string' && root) {
    state.root = root.replace(trailingSlashRegex, '')
  }
  state.isWeb = context.isWeb === true
}

export const getComputerUseNodePath = (): string => {
  if (
    !state.root ||
    state.isWeb ||
    state.root.startsWith('http://') ||
    state.root.startsWith('https://')
  ) {
    return ''
  }
  return `${state.root}/node/src/computerUseClient.js`
}

export const resetExtensionRuntime = (): void => {
  state.isWeb = false
  state.root = ''
}
