import { executeCommand, getAccessToken, getPreference } from '@lvce-editor/api'

export interface BackendConfiguration {
  readonly accessToken: string
  readonly baseUrl: string
  readonly loginRequired?: boolean
  readonly openAiWebSearch?: boolean
  readonly refreshAccessToken?: () => Promise<string>
  readonly supportsStreaming: boolean
}

interface BackendConfigurationHost {
  readonly executeCommand: (
    id: string,
    ...args: readonly unknown[]
  ) => Promise<unknown>
  readonly getAccessToken: (options: {
    readonly refresh: 'if-needed' | 'always'
  }) => Promise<unknown>
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
  defaultValue = false,
): Promise<boolean> => {
  try {
    const value = await host.getPreference(key)
    return typeof value === 'boolean' ? value : defaultValue
  } catch {
    return defaultValue
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
    return getString(
      await host.getAccessToken({
        refresh: 'if-needed',
      }),
    )
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
  providedAccessToken = '',
): Promise<BackendConfiguration> => {
  const [
    configuredBaseUrl,
    editorBaseUrl,
    configuredSupportsStreaming,
    useMockBackend,
    openAiWebSearch,
  ] = await Promise.all([
    getPreferenceString(host, 'chat2.backendUrl'),
    executeStringCommand(host, 'Layout.getBackendUrl'),
    getPreferenceBoolean(host, 'chat2.supportsStreaming'),
    getPreferenceBoolean(host, 'chat2.useMockBackend'),
    getPreferenceBoolean(host, 'chat2.openAiWebSearch', true),
  ])
  if (useMockBackend) {
    return {
      accessToken: '',
      baseUrl: '',
      openAiWebSearch,
      supportsStreaming: configuredSupportsStreaming,
    }
  }
  const baseUrl = configuredBaseUrl || editorBaseUrl
  const usesEditorBackend = Boolean(
    baseUrl &&
    editorBaseUrl &&
    normalizeBackendUrl(baseUrl) === normalizeBackendUrl(editorBaseUrl),
  )
  const accessToken = usesEditorBackend
    ? providedAccessToken || (await resolveAccessToken(host))
    : ''
  const supportsStreaming = usesEditorBackend || configuredSupportsStreaming
  return {
    accessToken,
    baseUrl,
    openAiWebSearch,
    supportsStreaming,
    ...(usesEditorBackend && {
      refreshAccessToken: async (): Promise<string> =>
        getString(await host.getAccessToken({ refresh: 'always' })),
    }),
    ...(usesEditorBackend && !accessToken && { loginRequired: true }),
  }
}
