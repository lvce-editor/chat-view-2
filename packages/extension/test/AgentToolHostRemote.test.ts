import { beforeEach, expect, jest, test } from '@jest/globals'
import { createMockRpc } from '@lvce-editor/rpc'
import {
  ExtensionManagementWorker,
  FileSystemWorker,
} from '@lvce-editor/rpc-registry'
import {
  createAgentToolHost,
  type AgentToolResult,
} from '../src/parts/AgentToolHost/AgentToolHost.ts'

const readDirWithFileTypes =
  jest.fn<
    (
      uri: string,
    ) => Promise<readonly { readonly name: string; readonly type: number }[]>
  >()
const readFile = jest.fn<(uri: string) => Promise<string>>()

const formattedRead =
  /^1: Remote README\n2: Actual file text\n\n\[hash [a-f\d]{8}; lines 1-2 of 2\]$/
const workspace = 'remote-ssh://user@example.com:2222/home/project%20files/'
const uri = `${workspace}src/hello%20world.txt`
const read = (target = uri): Promise<AgentToolResult> =>
  createAgentToolHost({
    workspaceUriProvider: async () => workspace,
  }).execute({
    arguments: JSON.stringify({ uri: target }),
    callId: 'read-1',
    name: 'read_file',
  })

beforeEach(() => {
  jest.resetAllMocks()
  FileSystemWorker.set(
    createMockRpc({
      commandMap: {
        'FileSystem.readDirWithFileTypes': readDirWithFileTypes,
      },
    }),
  )
  ExtensionManagementWorker.set(
    createMockRpc({
      commandMap: {
        'ExtensionApi.readFile': readFile,
      },
    }),
  )
  readDirWithFileTypes.mockImplementation(async (directory) => {
    if (directory === workspace) {
      return [{ name: 'src', type: 3 }]
    }
    if (directory === `${workspace}src/`) {
      return [{ name: 'hello world.txt', type: 7 }]
    }
    throw new Error(`Unexpected directory: ${directory}`)
  })
  readFile.mockResolvedValue('Remote README\nActual file text')
})

test('reads remote text with line numbers and preserves SSH authority and encoded paths', async () => {
  const result = await read()
  expect(result.isError).toBe(false)
  expect(result.content).toMatch(formattedRead)
  expect(readDirWithFileTypes.mock.calls).toEqual([
    [workspace],
    [`${workspace}src/`],
  ])
  expect(readFile).toHaveBeenCalledWith(uri)
})

test.each([
  'remote-ssh://other@example.com:2222/home/project%20files/src/file.txt',
  'remote-ssh://user@other.example.com:2222/home/project%20files/src/file.txt',
  'remote-ssh://user@example.com:2223/home/project%20files/src/file.txt',
  `${workspace}../outside.txt`,
  `${workspace}src${encodeURIComponent('/')}outside.txt`,
  `${workspace}.git/config`,
])('rejects remote URI outside workspace confinement: %s', async (target) => {
  expect(await read(target)).toEqual({
    content: expect.stringContaining('URI must stay inside the workspace'),
    isError: true,
  })
  expect(readFile).not.toHaveBeenCalled()
  expect(readDirWithFileTypes).not.toHaveBeenCalled()
})

test.each([9, 10, 11])(
  'rejects remote symbolic links of type %s',
  async (type) => {
    readDirWithFileTypes.mockResolvedValue([{ name: 'src', type }])
    expect(await read()).toEqual({
      content: expect.stringContaining('Symbolic links are not allowed'),
      isError: true,
    })
    expect(readFile).not.toHaveBeenCalled()
  },
)

test('reports a missing remote file', async () => {
  readFile.mockRejectedValue(new Error(`ENOENT: no such file ${uri}`))
  expect(await read()).toEqual({
    content: `ENOENT: no such file ${uri}`,
    isError: true,
  })
})

test('searches remote directories and returns the matching file URI and line', async () => {
  const host = createAgentToolHost({
    workspaceUriProvider: async () => workspace,
  })
  // Search directory URIs do not require a trailing slash.
  readDirWithFileTypes.mockImplementation(async (directory) =>
    directory === workspace
      ? [{ name: 'src', type: 3 }]
      : [{ name: 'hello world.txt', type: 7 }],
  )
  expect(
    await host.execute({
      arguments: JSON.stringify({ query: 'Actual' }),
      callId: 'search-1',
      name: 'search_workspace',
    }),
  ).toEqual({
    content: `${uri}:2: Actual file text`,
    isError: false,
  })
})

test('keeps the remote workspace context when AGENTS.md is absent', async () => {
  const host = createAgentToolHost({
    workspaceUriProvider: async () => workspace,
  })
  expect(await host.getWorkspaceContext()).toContain(
    `Current workspace URI: ${workspace}`,
  )
  expect(readFile).not.toHaveBeenCalled()
})

test('reads remote repository instructions using directory entries', async () => {
  readDirWithFileTypes.mockResolvedValue([{ name: 'AGENTS.md', type: 7 }])
  readFile.mockResolvedValue('Use the project conventions')
  const host = createAgentToolHost({
    workspaceUriProvider: async () => workspace,
  })
  const context = await host.getWorkspaceContext()
  expect(context).toContain(`Current workspace URI: ${workspace}`)
  expect(context).toContain(
    'Repository instructions from AGENTS.md:\nUse the project conventions',
  )
  expect(readFile).toHaveBeenCalledWith(`${workspace}AGENTS.md`)
})

test.each([9, 10, 11])(
  'does not follow AGENTS.md symlinks of type %s',
  async (type) => {
    readDirWithFileTypes.mockResolvedValue([{ name: 'AGENTS.md', type }])
    const host = createAgentToolHost({
      workspaceUriProvider: async () => workspace,
    })
    expect(await host.getWorkspaceContext()).toContain(
      `Current workspace URI: ${workspace}`,
    )
    expect(readFile).not.toHaveBeenCalled()
  },
)
