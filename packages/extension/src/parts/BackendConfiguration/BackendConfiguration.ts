import { executeCommand, getPreference } from '@lvce-editor/api'

export interface BackendConfiguration {
  readonly accessToken: string
  readonly baseUrl: string
}

interface BackendConfigurationHost {
  readonly executeCommand: (
    id: string,
    ...args: readonly unknown[]
  ) => Promise<unknown>
  readonly getPreference: (key: string) => Promise<unknown>
}

const defaultHost: BackendConfigurationHost = {
  executeCommand,
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

const getAccessToken = async (
  host: BackendConfigurationHost,
): Promise<string> => {
  try {
    const value = await host.executeCommand('Layout.getAuthState')
    if (!value || typeof value !== 'object') {
      return ''
    }
    return getString((value as Readonly<Record<string, unknown>>).accessToken)
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
  const [configuredBaseUrl, editorBaseUrl] = await Promise.all([
    getPreferenceString(host, 'chat2.backendUrl'),
    executeStringCommand(host, 'Layout.getBackendUrl'),
  ])
  const baseUrl = configuredBaseUrl || editorBaseUrl
  const accessToken =
    baseUrl &&
    editorBaseUrl &&
    normalizeBackendUrl(baseUrl) === normalizeBackendUrl(editorBaseUrl)
      ? await getAccessToken(host)
      : ''
  return { accessToken, baseUrl }
}
