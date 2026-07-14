import { executeCommand, getAccessToken, getPreference } from '@lvce-editor/api'

export interface BackendConfiguration {
  readonly accessToken: string
  readonly baseUrl: string
  readonly supportsStreaming: boolean
}

interface BackendConfigurationHost {
  readonly executeCommand: (
    id: string,
    ...args: readonly unknown[]
  ) => Promise<unknown>
  readonly getAccessToken: () => Promise<unknown>
  readonly getPreference: (key: string) => Promise<unknown>
}

const defaultHost: BackendConfigurationHost = {
  executeCommand,
  getAccessToken,
  getPreference,
}

const getString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const getPreferenceString = async (
  host: BackendConfigurationHost,
  key: string,
): Promise<string> => {
  try {
    return getString(await host.getPreference(key))
  } catch {
    return ''
  }
}

const getPreferenceBoolean = async (
  host: BackendConfigurationHost,
  key: string,
): Promise<boolean> => {
  try {
    return (await host.getPreference(key)) === true
  } catch {
    return false
  }
}

const executeStringCommand = async (
  host: BackendConfigurationHost,
  id: string,
): Promise<string> => {
  try {
    return getString(await host.executeCommand(id))
  } catch {
    return ''
  }
}

const resolveAccessToken = async (
  host: BackendConfigurationHost,
): Promise<string> => {
  try {
    return getString(await host.getAccessToken())
  } catch {
    return ''
  }
}

const normalizeBackendUrl = (value: string): string => {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') {
    end--
  }
  return value.slice(0, end)
}

export const resolveBackendConfiguration = async (
  host: BackendConfigurationHost = defaultHost,
): Promise<BackendConfiguration> => {
  const [
    configuredBaseUrl,
    editorBaseUrl,
    configuredSupportsStreaming,
    useMockBackend,
  ] = await Promise.all([
    getPreferenceString(host, 'chat2.backendUrl'),
    executeStringCommand(host, 'Layout.getBackendUrl'),
    getPreferenceBoolean(host, 'chat2.supportsStreaming'),
    getPreferenceBoolean(host, 'chat2.useMockBackend'),
  ])
  if (useMockBackend) {
    return {
      accessToken: '',
      baseUrl: '',
      supportsStreaming: configuredSupportsStreaming,
    }
  }
  const baseUrl = configuredBaseUrl || editorBaseUrl
  const usesEditorBackend = Boolean(
    baseUrl &&
    editorBaseUrl &&
    normalizeBackendUrl(baseUrl) === normalizeBackendUrl(editorBaseUrl),
  )
  const accessToken = usesEditorBackend ? await resolveAccessToken(host) : ''
  const supportsStreaming = usesEditorBackend || configuredSupportsStreaming
  return { accessToken, baseUrl, supportsStreaming }
}
