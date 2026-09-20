/* eslint-disable @typescript-eslint/explicit-function-return-type, regex/hoist-regex */
import { expect, jest, test } from '@jest/globals'
import {
  createAgentToolHost,
  type AgentFileSystem,
} from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'

const workspace = 'remote-ssh://user@example.com:2222/home/project%20files/'
const uri = `${workspace}src/hello%20world.txt`

const createFileSystem = (): AgentFileSystem => {
  const readDirWithFileTypes = jest.fn(async (directory: string) => {
    if (directory === workspace) {
      return [{ name: 'src', type: 3 }]
    }
    if (directory === `${workspace}src/` || directory === `${workspace}src`) {
      return [{ name: 'hello world.txt', type: 7 }]
    }
    return []
  })
  const readFile = jest.fn(async (target: string) => {
    if (target === uri) {
      return 'Remote README\nActual file text'
    }
    throw new Error(`ENOENT: no such file ${target}`)
  })
  return {
    exists: async (target) => target === uri,
    readDirWithFileTypes,
    readFile,
    remove: async () => {},
    writeFile: async () => {},
  }
}

const createHost = () =>
  createAgentToolHost({
    fileSystem: createFileSystem(),
    workspaceUriProvider: async () => workspace,
  })

test('reads remote text with line numbers and preserves encoded paths', async () => {
  await expect(
    createHost().execute({
      arguments: JSON.stringify({ uri }),
      callId: 'read-1',
      name: 'read_file',
    }),
  ).resolves.toMatchObject({
    content: expect.stringMatching(/^1: Remote README\n2: Actual file text/),
    isError: false,
  })
})

test.each([
  'remote-ssh://other@example.com:2222/home/project%20files/src/file.txt',
  `${workspace}../outside.txt`,
  `${workspace}.git/config`,
])('rejects remote URI outside workspace confinement: %s', async (target) => {
  await expect(
    createHost().execute({
      arguments: JSON.stringify({ uri: target }),
      callId: 'read-1',
      name: 'read_file',
    }),
  ).resolves.toEqual({
    content: expect.stringContaining('URI must stay inside the workspace'),
    isError: true,
  })
})

test('searches remote directories and returns matching lines', async () => {
  await expect(
    createHost().execute({
      arguments: JSON.stringify({ query: 'Actual' }),
      callId: 'search-1',
      name: 'search_workspace',
    }),
  ).resolves.toEqual({
    content: `${uri}:2: Actual file text`,
    isError: false,
  })
})
