import { expect, test } from '@jest/globals'
import { executeTypeScript } from '../src/parts/TypeScriptEvaluationWorker/TypeScriptEvaluationWorkerCommandMap.ts'

test('transforms typed code and returns the exported main result', async () => {
  await expect(
    executeTypeScript(`
      type NumberFunction = (value: number) => number
      const fibonacci: NumberFunction = (value) => value < 2 ? value : fibonacci(value - 1) + fibonacci(value - 2)
      export const main = ({ Workspace }: { Workspace: { uri: string } }) => ({ value: fibonacci(6), uri: Workspace.uri })
    `),
  ).resolves.toEqual({
    result: '{"value":8,"uri":"file:///workspace/"}',
    success: true,
  })
})

test('supports asynchronous main functions and independent module exports', async () => {
  await expect(
    executeTypeScript(
      'export const main = async () => await Promise.resolve("first")',
    ),
  ).resolves.toEqual({ result: '"first"', success: true })
  await expect(
    executeTypeScript('export const main = () => "second"'),
  ).resolves.toEqual({ result: '"second"', success: true })
})

test('provides reusable in-memory FileSystem and Workspace mocks', async () => {
  await expect(
    executeTypeScript(`
      export const main = async ({ FileSystem, Workspace }: { FileSystem: { readFile: (uri: string) => Promise<string>, writeFile: (uri: string, content: string) => Promise<void> }, Workspace: { uri: string } }) => {
        await FileSystem.writeFile(Workspace.uri + 'result.txt', 'saved')
        return await FileSystem.readFile(Workspace.uri + 'result.txt')
      }
    `),
  ).resolves.toEqual({ result: '"saved"', success: true })
})

test.each([
  ['invalid TypeScript', 'export const main = ('],
  ['missing main', 'export const notMain = () => 1'],
  ['thrown error', 'export const main = () => { throw new Error("boom") }'],
  [
    'rejected promise',
    'export const main = async () => { throw new Error("rejected") }',
  ],
  ['unsupported result', 'export const main = () => undefined'],
])('%s returns a useful error result', async (_name, code) => {
  await expect(executeTypeScript(code)).resolves.toMatchObject({
    error: expect.any(String),
    success: false,
  })
})

test('continues executing after a failed request', async () => {
  await expect(
    executeTypeScript('export const main = () => { throw new Error("boom") }'),
  ).resolves.toMatchObject({ success: false })
  await expect(
    executeTypeScript('export const main = () => 3'),
  ).resolves.toEqual({ result: '3', success: true })
})
