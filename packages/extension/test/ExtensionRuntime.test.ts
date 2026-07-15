import { afterEach, expect, test } from '@jest/globals'
import {
  getComputerUseNodePath,
  resetExtensionRuntime,
  setExtensionRuntime,
} from '../src/parts/ExtensionRuntime/ExtensionRuntime.ts'

afterEach(resetExtensionRuntime)

test('resolves the bundled computer-use node client from the extension root', () => {
  setExtensionRuntime({ path: '/extensions/builtin.chat-view-2/' })

  expect(getComputerUseNodePath()).toBe(
    '/extensions/builtin.chat-view-2/node/src/computerUseClient.js',
  )
})

test.each([
  { isWeb: true, path: '/extensions/builtin.chat-view-2' },
  { path: 'https://example.com/extensions/builtin.chat-view-2' },
])(
  'does not start the Linux node client in web runtimes',
  (runtime: Readonly<{ isWeb?: boolean; path: string }>) => {
    setExtensionRuntime(runtime)

    expect(getComputerUseNodePath()).toBe('')
  },
)
