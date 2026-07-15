import { expect, test } from '@jest/globals'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAgentToolHost } from '../src/parts/AgentToolHost/AgentToolHost.ts'
import {
  createNodeCommandExecutor,
  isNodeRuntime,
} from '../src/parts/NodeCommandExecutor/NodeCommandExecutor.ts'

const createExecutor = (
  getWorkspaceFolder: () => Promise<string>,
): NonNullable<ReturnType<typeof createNodeCommandExecutor>> => {
  const executor = createNodeCommandExecutor({
    getWorkspaceFolder,
    runtime: process,
  })
  if (!executor) {
    throw new Error('Expected the command executor to be available in Node')
  }
  return executor
}

const runtimeCases: readonly (readonly [unknown, boolean])[] = [
  [undefined, false],
  [null, false],
  [{}, false],
  [{ versions: {} }, false],
  [{ versions: { node: '' } }, false],
  [{ versions: { node: '24.0.0' } }, true],
]

test.each(runtimeCases)(
  'detects whether the runtime is Node',
  (runtime, expected) => {
    expect(isNodeRuntime(runtime)).toBe(expected)
  },
)

test('does not create a command executor for the web platform', () => {
  expect(createNodeCommandExecutor({ runtime: null })).toBeUndefined()
})

test('runs Bash commands from a file URI workspace', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'chat-view-2-command-'))
  try {
    const executor = createExecutor(async () => pathToFileURL(workspace).href)
    const result = await executor.execute(`printf '%s' "$(basename "$PWD")"`, {
      onOutput() {},
      outputLimit: 1024,
      timeoutMs: 1000,
    })

    expect(result).toEqual({ exitCode: 0, output: basename(workspace) })
    const definitions = createAgentToolHost({ commandExecutor: executor })
      .getDefinitions()
      .map((definition) => definition.name)
    expect(definitions).toContain('run_command')
  } finally {
    await rm(workspace, { recursive: true })
  }
})

test('limits command output', async () => {
  const executor = createExecutor(async () => process.cwd())
  const chunks: string[] = []
  const result = await executor.execute(`printf '123456789'`, {
    onOutput(chunk) {
      chunks.push(chunk)
    },
    outputLimit: 5,
    timeoutMs: 1000,
  })

  expect(result).toEqual({ exitCode: 0, output: '12345' })
  expect(chunks.join('')).toBe('12345')
})

test('stops a command after its timeout', async () => {
  const executor = createExecutor(async () => process.cwd())
  const result = await executor.execute(`while true; do :; done`, {
    onOutput() {},
    outputLimit: 1024,
    timeoutMs: 20,
  })

  expect(result.exitCode).toBe(124)
  expect(result.output).toContain('Command timed out after 20ms')
})

test('stops a command when it is aborted', async () => {
  const executor = createExecutor(async () => process.cwd())
  const controller = new AbortController()
  const resultPromise = executor.execute(`while true; do :; done`, {
    onOutput() {},
    outputLimit: 1024,
    signal: controller.signal,
    timeoutMs: 1000,
  })
  setTimeout(() => controller.abort(), 20)

  await expect(resultPromise).resolves.toEqual({
    exitCode: 130,
    output: '\nCommand was aborted',
  })
})
