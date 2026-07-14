import { expect, test } from '@jest/globals'
import {
  createAgentToolHost,
  getLineChanges,
  validateWorkspaceRelativePath,
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

test('normalizes a workspace-relative path', () => {
  expect(validateWorkspaceRelativePath('packages\\extension/src/a.ts')).toBe(
    'packages/extension/src/a.ts',
  )
})

test('uses a stable workspace label for portable evaluation requests', () => {
  expect(workspaceContextLabel).toBe(
    'Workspace root: .\nAll tool paths must be relative to this root.',
  )
  expect(workspaceContextLabel).not.toContain('file://')
})

test.each([
  '../outside',
  '/etc/passwd',
  'C:\\Users\\file',
  'file:///tmp/file',
  '.git/config',
])('rejects unsafe workspace path %s', (path) => {
  expect(() => validateWorkspaceRelativePath(path)).toThrow(
    'Path must stay inside the workspace',
  )
})

test('removes commands and diagnostics from the catalog when their secure hosts are unavailable', () => {
  const names = createAgentToolHost()
    .getDefinitions()
    .map((definition) => definition.name)

  expect(names).not.toContain('run_command')
  expect(names).not.toContain('get_diagnostics')
  expect(names).toEqual(
    expect.arrayContaining(['search_workspace', 'read_file', 'apply_patch']),
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
    expect.arrayContaining(['search_workspace', 'read_file']),
  )
  expect(names).not.toContain('apply_patch')
  await expect(
    host.execute({
      arguments: JSON.stringify({
        newText: 'after',
        oldText: 'before',
        path: 'a.ts',
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
    expect.arrayContaining(['search_workspace', 'read_file', 'apply_patch']),
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
