import { strictEqual } from 'node:assert'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { createBrowserTestSource } from '../src/Browser.ts'

void test('generates a command-driven browser evaluation', () => {
  const workspace = '/tmp/evaluation workspace'
  const workspaceUri = pathToFileURL(workspace).href
  const serializedWorkspace = `"workspace":${JSON.stringify(workspaceUri)}`
  const source = createBrowserTestSource({
    backendOrigin: 'http://127.0.0.1:8787',
    model: 'test-model',
    prompt: 'Create "index.html".\nThen verify it.',
    scenarioId: 'hello-world',
    timeoutMs: 30_000,
    workspace,
  })

  strictEqual(source.includes(serializedWorkspace), true)
  strictEqual(
    source.includes('Workspace.setPath(configuration.workspace)'),
    true,
  )
  strictEqual(source.includes("'chat2.createSession'"), true)
  strictEqual(source.includes("'chat2.sendMessage'"), true)
  strictEqual(source.includes("'chat2.supportsStreaming': true"), true)
  strictEqual(
    source.includes('Create \\"index.html\\".\\nThen verify it.'),
    true,
  )
  strictEqual(source.includes('Locator'), false)
})
