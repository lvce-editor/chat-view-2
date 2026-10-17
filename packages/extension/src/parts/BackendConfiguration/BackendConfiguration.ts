import { executeCommand, getAccessToken, getPreference } from '@lvce-editor/api'

export interface BackendConfiguration {
  readonly accessToken: string
  readonly baseUrl: string
  readonly loginRequired?: boolean
  readonly openAiWebSearch?: boolean
  readonly refreshAccessToken?: () => Promise<string>
  readonly supportsStreaming: boolean
  readonly titleModelId?: string
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

const getPreferenceValue = async (
  host: BackendConfigurationHost,
  key: string,
): Promise<unknown> => {
  try {
    return await host.getPreference(key)
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

const allowedTitleModels = new Set(['gpt-6-luna', 'gpt-5.6-luna'])

const getTitleModelId = (value: unknown): string => {
  const modelId = getString(value)
  return allowedTitleModels.has(modelId) ? modelId : 'gpt-6-luna'
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
    titleModelId,
  ] = await Promise.all([
    getPreferenceString(host, 'chat2.backendUrl'),
    executeStringCommand(host, 'Layout.getBackendUrl'),
    getPreferenceBoolean(host, 'chat2.supportsStreaming'),
    getPreferenceBoolean(host, 'chat2.useMockBackend'),
    getPreferenceBoolean(host, 'chat2.openAiWebSearch', true),
    getPreferenceValue(host, 'chat2.titleModelId'),
  ])
  if (useMockBackend) {
    return {
      accessToken: '',
      baseUrl: '',
      openAiWebSearch,
      supportsStreaming: configuredSupportsStreaming,
      titleModelId: getTitleModelId(titleModelId),
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
    titleModelId: getTitleModelId(titleModelId),
    ...(usesEditorBackend && {
      refreshAccessToken: async (): Promise<string> =>
        getString(await host.getAccessToken({ refresh: 'always' })),
    }),
    ...(usesEditorBackend && !accessToken && { loginRequired: true }),
  }
}
