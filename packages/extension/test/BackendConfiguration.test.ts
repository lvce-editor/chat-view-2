import { expect, jest, test } from '@jest/globals'
import { resolveBackendConfiguration } from '../src/parts/BackendConfiguration/BackendConfiguration.ts'

type BackendConfigurationHost = NonNullable<
  Parameters<typeof resolveBackendConfiguration>[0]
>

const createHost = ({
  accessToken = 'editor-token',
  backendUrl = 'https://lvce-editor.dev',
  configuredBackendUrl = '',
  useMockBackend = false,
}: {
  readonly accessToken?: string
  readonly backendUrl?: string
  readonly configuredBackendUrl?: string
  readonly useMockBackend?: boolean
} = {}): BackendConfigurationHost => {
  const executeCommand = jest.fn(async (id: string): Promise<unknown> => {
    if (id === 'Layout.getBackendUrl') {
      return backendUrl
    }
    if (id === 'Layout.getAuthState') {
      return { accessToken, signInState: 'loggedIn' }
    }
    throw new Error(`Unexpected command: ${id}`)
  })
  return {
    executeCommand,
    getPreference: jest.fn(async (key: string) =>
      key === 'chat2.useMockBackend' ? useMockBackend : configuredBackendUrl,
    ),
  }
}

test('uses the editor backend and authentication by default', async () => {
  const host = createHost()

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: 'editor-token',
    baseUrl: 'https://lvce-editor.dev',
  })
  expect(host.getPreference).toHaveBeenCalledWith('chat2.backendUrl')
  expect(host.executeCommand).toHaveBeenCalledWith('Layout.getBackendUrl')
  expect(host.executeCommand).toHaveBeenCalledWith('Layout.getAuthState')
})

test('uses editor authentication for an equivalent configured backend URL', async () => {
  const host = createHost({
    backendUrl: 'https://lvce-editor.dev/',
    configuredBackendUrl: 'https://lvce-editor.dev',
  })

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: 'editor-token',
    baseUrl: 'https://lvce-editor.dev',
  })
})

test('does not expose editor authentication to a custom backend', async () => {
  const host = createHost({
    configuredBackendUrl: 'https://backend.example.com',
  })

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: '',
    baseUrl: 'https://backend.example.com',
  })
  expect(host.executeCommand).not.toHaveBeenCalledWith('Layout.getAuthState')
})

test('uses the deterministic mock backend when explicitly configured', async () => {
  const host = createHost({ useMockBackend: true })

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: '',
    baseUrl: '',
  })
  expect(host.executeCommand).not.toHaveBeenCalledWith('Layout.getAuthState')
})

test('falls back to the mock backend when editor configuration is unavailable', async () => {
  const host = {
    executeCommand: jest.fn(async () => {
      throw new Error('Command unavailable')
    }),
    getPreference: jest.fn(async () => {
      throw new Error('Preferences unavailable')
    }),
  }

  await expect(resolveBackendConfiguration(host)).resolves.toEqual({
    accessToken: '',
    baseUrl: '',
  })
})
