/* eslint-disable unicorn/max-nested-calls */
import { expect, jest, test } from '@jest/globals'
import {
  createAgentToolHost,
  getLineChanges,
  getWorkspaceRelativePath,
  workspaceContextLabel,
} from '../src/parts/AgentToolHost/AgentToolHost.ts'

test.each([
  ['', 'first\nsecond\n', { additions: 2, deletions: 0 }],
  ['before', 'after', { additions: 1, deletions: 1 }],
  [
    'unchanged\nbefore\ncontext',
    'unchanged\nafter\ncontext',
    { additions: 1, deletions: 1 },
  ],
  ['first\nsecond', 'first\ninserted\nsecond', { additions: 1, deletions: 0 }],
])(
  'counts changed lines in an applied patch',
  (
    oldText,
    newText,
    expected: Readonly<{ additions: number; deletions: number }>,
  ) => {
    expect(getLineChanges(oldText, newText)).toEqual(expected)
  },
)

test('gets a portable workspace-relative display path from a file uri', () => {
  expect(
    getWorkspaceRelativePath(
      'file:///C:/Users/Test/workspace/',
      'file:///C:/Users/Test/workspace/src/hello%20world.ts',
    ),
  ).toBe('src/hello world.ts')
})

test.each([
  'file:///workspace/../outside',
  'file:///other/file.ts',
  'https://example.com/workspace/file.ts',
  'file:///workspace/.git/config',
])('rejects uri outside the workspace %s', (uri) => {
  expect(() => getWorkspaceRelativePath('file:///workspace/', uri)).toThrow(
    'URI must stay inside the workspace',
  )
})

test('uses a stable workspace label for portable evaluation requests', () => {
  expect(workspaceContextLabel).toBe(
    'Workspace file tools use absolute URIs. Call get_workspace_uri before read_file or apply_patch, and only use URIs inside that workspace.',
  )
  expect(workspaceContextLabel).not.toContain('file://')
})

test('uses uri arguments for file tools', () => {
  const definitions = createAgentToolHost().getDefinitions()
  const readFile = definitions.find(({ name }) => name === 'read_file')
  const applyPatch = definitions.find(({ name }) => name === 'apply_patch')

  expect(readFile?.inputSchema).toEqual(
    expect.objectContaining({
      properties: expect.objectContaining({ uri: expect.any(Object) }),
      required: ['uri'],
    }),
  )
  expect(readFile?.inputSchema).not.toEqual(
    expect.objectContaining({
      properties: expect.objectContaining({ path: expect.anything() }),
    }),
  )
  expect(applyPatch?.inputSchema).toEqual(
    expect.objectContaining({
      properties: expect.objectContaining({ uri: expect.any(Object) }),
      required: ['uri', 'oldText', 'newText'],
    }),
  )
})

test('get_workspace_uri returns the current workspace uri', async () => {
  const workspaceUriProvider = jest.fn(async () => 'file:///workspace')
  const host = createAgentToolHost({ workspaceUriProvider })

  await expect(
    host.execute({
      arguments: '{}',
      callId: 'call-1',
      name: 'get_workspace_uri',
    }),
  ).resolves.toEqual({
    content: 'file:///workspace/',
    isError: false,
  })
  expect(workspaceUriProvider).toHaveBeenCalledTimes(1)
})

test('removes commands and diagnostics from the catalog when their secure hosts are unavailable', () => {
  const names = createAgentToolHost()
    .getDefinitions()
    .map((definition) => definition.name)

  expect(names).not.toContain('run_command')
  expect(names).not.toContain('get_diagnostics')
  expect(names).toEqual(
    expect.arrayContaining([
      'get_workspace_uri',
      'search_workspace',
      'read_file',
      'apply_patch',
    ]),
  )
})

test('exposes read tools but not write tools in a read-only workspace sandbox', async () => {
  const host = createAgentToolHost({
    fileSystemAccess: {
      allowRead: true,
      allowWrite: false,
      root: '.',
    },
  })
  const names = host.getDefinitions().map((definition) => definition.name)

  expect(names).toEqual(
    expect.arrayContaining([
      'get_workspace_uri',
      'search_workspace',
      'read_file',
    ]),
  )
  expect(names).not.toContain('apply_patch')
  await expect(
    host.execute({
      arguments: JSON.stringify({
        newText: 'after',
        oldText: 'before',
        uri: 'file:///workspace/a.ts',
      }),
      callId: 'call-1',
      name: 'apply_patch',
    }),
  ).resolves.toEqual({
    content: 'Tool apply_patch is disabled by the file system sandbox',
    isError: true,
  })
})

test('write access implies workspace read access', () => {
  const names = createAgentToolHost({
    fileSystemAccess: {
      allowRead: false,
      allowWrite: true,
      root: '.',
    },
  })
    .getDefinitions()
    .map((definition) => definition.name)

  expect(names).toEqual(
    expect.arrayContaining([
      'get_workspace_uri',
      'search_workspace',
      'read_file',
      'apply_patch',
    ]),
  )
})

test('rejects unsupported sandbox roots', () => {
  expect(() =>
    createAgentToolHost({
      fileSystemAccess: {
        allowRead: true,
        allowWrite: false,
        root: '/tmp' as '.',
      },
    }),
  ).toThrow('Unsupported agent sandbox root: /tmp')
})
