import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import { createRpc } from '@lvce-editor/api'

interface MathRpc {
  readonly dispose: () => Promise<void> | void
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<unknown>
}

const rpcId = 'builtin.chat-view-2.chat-math-worker'
const cssWorkerRpcId = 'builtin.chat-view-2.chat-math-css-worker'
const state: { rpcPromise: Promise<MathRpc> | undefined } = {
  rpcPromise: undefined,
}
const cssWorkerState: { rpcPromise: Promise<MathRpc> | undefined } = {
  rpcPromise: undefined,
}
const renderedMath = new Map<string, readonly VirtualDomNode[]>()

const getRpc = (): Promise<MathRpc> => {
  const { rpcPromise } = state
  if (rpcPromise) {
    return rpcPromise
  }
  const newRpcPromise = createRpc({ id: rpcId }) as Promise<MathRpc>
  state.rpcPromise = newRpcPromise
  return newRpcPromise
}

export const getMathKey = (source: string, displayMode: boolean): string =>
  `${displayMode ? 'display' : 'inline'}:${source}`

export const getRenderedMath = (
  source: string,
  displayMode: boolean,
): readonly VirtualDomNode[] | undefined =>
  renderedMath.get(getMathKey(source, displayMode))

export const renderMath = async (
  source: string,
  displayMode: boolean,
): Promise<readonly VirtualDomNode[]> => {
  const key = getMathKey(source, displayMode)
  const cached = renderedMath.get(key)
  if (cached) {
    return cached
  }
  const rpc = await getRpc()
  const result = await rpc.invoke(
    displayMode ? 'ChatMath.getMathBlockDom' : 'ChatMath.getMathInlineDom',
    { displayMode, text: source },
  )
  const nodes = result as readonly VirtualDomNode[]
  renderedMath.set(key, nodes)
  return nodes
}

export const getMathStylesheet = async (assetDir: string): Promise<string> => {
  const { rpcPromise } = cssWorkerState
  let rpc = rpcPromise ? await rpcPromise : undefined
  if (!rpc) {
    const newRpcPromise = createRpc({ id: cssWorkerRpcId }) as Promise<MathRpc>
    cssWorkerState.rpcPromise = newRpcPromise
    rpc = await newRpcPromise
  }
  const css = (await rpc.invoke('ChatMathCss.getStylesheet')) as string
  const fontsUrl = new URL('media/katex/fonts/', assetDir).href
  return css.split('url(fonts/').join(`url(${fontsUrl}`)
}
