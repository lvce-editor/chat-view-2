import { createRpc } from '@lvce-editor/api'

export interface TypeScriptExecutionSuccess {
  readonly result: string
  readonly success: true
}

export interface TypeScriptExecutionFailure {
  readonly error: string
  readonly success: false
}

export type TypeScriptExecutionResult =
  | TypeScriptExecutionFailure
  | TypeScriptExecutionSuccess

interface Rpc {
  readonly dispose: () => Promise<void> | void
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<unknown>
}

type CreateRpc = (options: { readonly id: string }) => Promise<Rpc>

export const state: {
  createRpc: CreateRpc
  rpcPromise: Promise<Rpc> | undefined
} = {
  createRpc,
  rpcPromise: undefined,
}

const rpcId = 'builtin.chat-view-2.typescript-evaluation-worker'

const getRpc = (): Promise<Rpc> => {
  const { createRpc, rpcPromise } = state
  if (rpcPromise) {
    return rpcPromise
  }
  const newRpcPromise = createRpc({ id: rpcId })
  state.rpcPromise = newRpcPromise
  return newRpcPromise
}

export const executeTypeScript = async (
  code: string,
): Promise<TypeScriptExecutionResult> => {
  const rpc = await getRpc()
  return (await rpc.invoke(
    'TypeScriptEvaluation.execute',
    code,
  )) as TypeScriptExecutionResult
}

export const dispose = async (): Promise<void> => {
  const { rpcPromise } = state
  state.rpcPromise = undefined
  if (!rpcPromise) {
    return
  }
  const rpc = await rpcPromise
  await rpc.dispose()
}
