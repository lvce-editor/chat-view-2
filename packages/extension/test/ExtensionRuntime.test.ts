import { afterEach, expect, test } from '@jest/globals'
import {
  getComputerUseNodePath,
  resetExtensionRuntime,
  setExtensionRuntime,
  setExtensionRuntimeFromModuleUrl,
} from '../src/parts/ExtensionRuntime/ExtensionRuntime.ts'

afterEach(resetExtensionRuntime)

test('resolves the bundled computer-use node client from the extension root', () => {
  setExtensionRuntime({ path: '/extensions/builtin.chat-view-2/' })

  expect(getComputerUseNodePath()).toBe(
    '/extensions/builtin.chat-view-2/node/src/computerUseClient.js',
  )
})

test('resolves the server-side node client in a web runtime', () => {
  setExtensionRuntime({
    isWeb: true,
    path: '/home/user/chat-view-2/packages/extension',
    uri: 'file:///home/user/chat-view-2/packages/extension',
  })

  expect(getComputerUseNodePath()).toBe(
    '/home/user/chat-view-2/packages/node/src/computerUseClient.js',
  )
})

test('resolves a file uri when no filesystem path is provided', () => {
  setExtensionRuntime({
    uri: 'file:///home/user/Chat%20View',
  })

  expect(getComputerUseNodePath()).toBe(
    '/home/user/Chat View/node/src/computerUseClient.js',
  )
})

test('resolves the extension root from a localhost remote module url', () => {
  setExtensionRuntimeFromModuleUrl(
    'http://localhost:3000/remote/home/user/chat-view-2/packages/extension/dist/chatMain.js',
  )

  expect(getComputerUseNodePath()).toBe(
    '/home/user/chat-view-2/packages/node/src/computerUseClient.js',
  )
})

test('resolves the extension root from a file module url', () => {
  setExtensionRuntimeFromModuleUrl(
    'file:///home/user/Chat%20View/dist/chatMain.js',
  )

  expect(getComputerUseNodePath()).toBe(
    '/home/user/Chat View/node/src/computerUseClient.js',
  )
})

test('does not resolve a server path from a static http module url', () => {
  setExtensionRuntimeFromModuleUrl(
    'https://example.com/assets/extensions/chat-view-2/dist/chatMain.js',
  )

  expect(getComputerUseNodePath()).toBe('')
})

test.each([
  { isWeb: true, path: '/extensions/builtin.chat-view-2' },
  { path: 'https://example.com/extensions/builtin.chat-view-2' },
  {
    isWeb: true,
    path: '/extensions/builtin.chat-view-2',
    uri: 'https://example.com/extensions/builtin.chat-view-2',
  },
])(
  'does not start the Linux node client without a server-side extension path',
  (runtime: Readonly<{ isWeb?: boolean; path: string; uri?: string }>) => {
    setExtensionRuntime(runtime)

    expect(getComputerUseNodePath()).toBe('')
  },
)
