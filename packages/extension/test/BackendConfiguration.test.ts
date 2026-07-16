import { expect, jest, test } from '@jest/globals'
import { resolveBackendConfiguration } from '../src/parts/BackendConfiguration/BackendConfiguration.ts'

type BackendConfigurationHost = NonNullable<
  Parameters<typeof resolveBackendConfiguration>[0]
>

const createHost = ({
  accessToken = 'editor-token',
  backendUrl = 'https://lvce-editor.dev',
  configuredBackendUrl = '',
  supportsStreaming = false,
  useMockBackend = false,
}: {
  readonly accessToken?: string
  readonly backendUrl?: string
  readonly configuredBackendUrl?: string
  readonly supportsStreaming?: boolean
  readonly useMockBackend?: boolean
} = {}): BackendConfigurationHost => {
  const executeCommand = jest.fn(async (id: string): Promise<unknown> => {
    if (id === 'Layout.getBackendUrl') {
      return backendUrl
    }
    throw new Error(`Unexpected command: ${id}`)
  })
  return {
    executeCommand,
    getAccessToken: jest.fn(async () => accessToken),
    getPreference: jest.fn(async (key: string) => {
      if (key === 'chat2.supportsStreaming') {
        return supportsStreaming
      }
      return key === 'chat2.useMockBackend'
        ? useMockBackend
        : configuredBackendUrl
    }),
  }
}

test('uses the editor backend and authentication by default', async () => {
  const host = createHost()

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: 'editor-token',
    baseUrl: 'https://lvce-editor.dev',
    supportsStreaming: true,
  })
  expect(host.getPreference).toHaveBeenCalledWith('chat2.backendUrl')
  expect(host.executeCommand).toHaveBeenCalledWith('Layout.getBackendUrl')
  expect(host.getAccessToken).toHaveBeenCalledWith({
    refresh: 'if-needed',
  })
})

test('uses editor authentication for an equivalent configured backend URL', async () => {
  const host = createHost({
    backendUrl: 'https://lvce-editor.dev/',
    configuredBackendUrl: 'https://lvce-editor.dev',
  })

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: 'editor-token',
    baseUrl: 'https://lvce-editor.dev',
    supportsStreaming: true,
  })
})

test('prefers prompt authentication for the editor backend', async () => {
  const host = createHost()

  await expect(
    resolveBackendConfiguration(host, 'prompt-access-token'),
  ).resolves.toEqual({
    accessToken: 'prompt-access-token',
    baseUrl: 'https://lvce-editor.dev',
    supportsStreaming: true,
  })
  expect(host.getAccessToken).not.toHaveBeenCalled()
})

test('does not expose editor authentication to a custom backend', async () => {
  const host = createHost({
    configuredBackendUrl: 'https://backend.example.com',
  })

  await expect(
    resolveBackendConfiguration(host, 'editor-access-token'),
  ).resolves.toEqual({
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    supportsStreaming: false,
  })
  expect(host.getAccessToken).not.toHaveBeenCalled()
})

test('uses the deterministic mock backend when explicitly configured', async () => {
  const host = createHost({ useMockBackend: true })

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: '',
    baseUrl: '',
    supportsStreaming: false,
  })
  expect(host.getAccessToken).not.toHaveBeenCalled()
})

test('falls back to the mock backend when editor configuration is unavailable', async () => {
  const host = {
    executeCommand: jest.fn(async () => {
      throw new Error('Command unavailable')
    }),
    getAccessToken: jest.fn(async () => {
      throw new Error('Auth unavailable')
    }),
    getPreference: jest.fn(async () => {
      throw new Error('Preferences unavailable')
    }),
  }

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: '',
    baseUrl: '',
    supportsStreaming: false,
  })
})

test('enables streaming for a custom backend only when explicitly configured', async () => {
  const host = createHost({
    configuredBackendUrl: 'https://backend.example.com',
    supportsStreaming: true,
  })

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: '',
    baseUrl: 'https://backend.example.com',
    supportsStreaming: true,
  })
  expect(host.getPreference).toHaveBeenCalledWith('chat2.supportsStreaming')
})
