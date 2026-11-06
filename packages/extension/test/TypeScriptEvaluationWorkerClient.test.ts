import { beforeEach, expect, jest, test } from '@jest/globals'
import * as TypeScriptEvaluationWorker from '../src/parts/TypeScriptEvaluationWorker/TypeScriptEvaluationWorker.ts'

const invoke =
  jest.fn<(method: string, ...params: readonly unknown[]) => Promise<unknown>>()
const dispose = jest.fn<() => Promise<void>>(async () => {})
const createRpc = jest.fn<
  (options: { readonly id: string }) => Promise<{
    readonly dispose: typeof dispose
    readonly invoke: typeof invoke
  }>
>(async () => ({ dispose, invoke }))

beforeEach(() => {
  jest.resetAllMocks()
  createRpc.mockResolvedValue({ dispose, invoke })
  TypeScriptEvaluationWorker.state.createRpc = createRpc
  TypeScriptEvaluationWorker.state.rpcPromise = undefined
})

test('lazily creates and reuses the TypeScript evaluation worker', async () => {
  const first = { result: '1', success: true as const }
  const second = { result: '2', success: true as const }
  invoke.mockResolvedValueOnce(first).mockResolvedValueOnce(second)

  await expect(
    TypeScriptEvaluationWorker.executeTypeScript('export const main = () => 1'),
  ).resolves.toBe(first)
  await expect(
    TypeScriptEvaluationWorker.executeTypeScript('export const main = () => 2'),
  ).resolves.toBe(second)

  expect(createRpc).toHaveBeenCalledTimes(1)
  expect(createRpc).toHaveBeenCalledWith({
    id: 'builtin.chat-view-2.typescript-evaluation-worker',
  })
  expect(invoke).toHaveBeenNthCalledWith(
    1,
    'TypeScriptEvaluation.execute',
    'export const main = () => 1',
  )
})

test('disposes the worker and can be called before initialization', async () => {
  await TypeScriptEvaluationWorker.dispose()
  expect(dispose).not.toHaveBeenCalled()

  invoke.mockResolvedValue({ result: '1', success: true as const })
  await TypeScriptEvaluationWorker.executeTypeScript(
    'export const main = () => 1',
  )
  await TypeScriptEvaluationWorker.dispose()

  expect(dispose).toHaveBeenCalledTimes(1)
  expect(TypeScriptEvaluationWorker.state.rpcPromise).toBeUndefined()
})
