import { expect, test } from '@jest/globals'
import {
  createAgentToolHost,
  getLineChanges,
  validateWorkspaceRelativePath,
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
