import {
  executeCommand,
  getPreference,
  setPreference,
  type View,
  type ViewContext,
  type ViewEvent,
  type VirtualDomViewInstance,
} from '@lvce-editor/api'
import { createSession, type BoardSession } from './BoardSession.ts'
import { render, type BoardState } from './Render.ts'
import {
  boardIdPattern,
  loadBoard,
  parseBoardId,
  TrelloError,
} from './Trello.ts'

export const viewId = 'chat2.views.board'
export const connectionsPreference = 'chat2.connectedBoardIds'

export interface BoardHost {
  readonly execute: typeof executeCommand
  readonly load: typeof loadBoard
  readonly read: typeof getPreference
  readonly session: BoardSession
  readonly write: typeof setPreference
}
const defaultHost: BoardHost = {
  execute: executeCommand,
  load: loadBoard,
  read: getPreference,
  session: createSession(),
  write: setPreference,
}

const getProviderAction = (
  name: string | undefined,
): 'trello' | 'providers' | undefined => {
  if (name === 'board-provider:trello') return 'trello'
  if (name === 'board-providers') return 'providers'
  return undefined
}

export const createInstance = async (
  context?: ViewContext,
  host: BoardHost = defaultHost,
): Promise<VirtualDomViewInstance> => {
  let connectedIds: readonly string[] = []
  try {
    const saved: unknown = await host.read(connectionsPreference)
    if (Array.isArray(saved))
      connectedIds = saved.filter(
        (id): id is string => typeof id === 'string' && boardIdPattern.test(id),
      )
  } catch {
    // The connection form remains usable when settings cannot be read.
  }
  const savedState = context?.state
  const savedId =
    typeof savedState === 'object' &&
    savedState !== null &&
    'boardId' in savedState &&
    typeof savedState.boardId === 'string'
      ? savedState.boardId
      : ''
  const initialId = connectedIds.includes(savedId)
    ? savedId
    : connectedIds[0] || ''
  const connection = host.session.get(initialId)
  let state: BoardState = {
    board: connection?.board,
    boardId: initialId,
    connectedIds,
    error: undefined,
    loading: false,
    providerSelected: false,
  }
  let apiKey = connection?.apiKey || ''
  let token = connection?.token || ''
  let generation = 0
  let controller: AbortController | undefined
  let disposed = false
  const notify = async (): Promise<void> => {
    if (!disposed) await context?.requestRerender()
  }
  const cancel = (): void => {
    generation++
    controller?.abort()
  }
  const connect = async (): Promise<void> => {
    cancel()
    const requestGeneration = generation
    controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30_000),
    ])
    state = { ...state, error: undefined, loading: true }
    try {
      const { boardId, connectedIds } = state
      const board = await host.load(boardId, apiKey, token, signal)
      if (disposed || requestGeneration !== generation) return
      const id = parseBoardId(boardId)
      host.session.set(id, { apiKey, board, token })
      const ids = [...new Set([...connectedIds, id])]
      state = {
        ...state,
        board,
        boardId: id,
        connectedIds: ids,
        loading: false,
      }
      try {
        await host.write(connectionsPreference, ids)
      } catch {
        if (disposed || requestGeneration !== generation) return
        state = {
          ...state,
          error: {
            code: 'BOARD_SETTINGS_FAILED',
            message:
              'The board is connected, but its ID could not be saved. Reconnect it next time.',
          },
        }
      }
    } catch (error) {
      if (disposed || requestGeneration !== generation) return
      state = {
        ...state,
        error:
          error instanceof TrelloError
            ? error.details
            : {
                code: 'TRELLO_REQUEST_FAILED',
                message:
                  'Unable to load this board. Check your connection and try again.',
              },
        loading: false,
      }
    }
    await notify()
  }
  const disconnect = async (): Promise<void> => {
    cancel()
    const { boardId, connectedIds } = state
    host.session.remove(boardId)
    const ids = connectedIds.filter((id) => id !== boardId)
    state = {
      ...state,
      board: undefined,
      boardId: '',
      connectedIds: ids,
      error: undefined,
      loading: false,
      providerSelected: false,
    }
    apiKey = ''
    token = ''
    try {
      await host.write(connectionsPreference, ids)
    } catch {
      state = {
        ...state,
        error: {
          code: 'BOARD_SETTINGS_FAILED',
          message: 'The saved board could not be removed. Try again.',
        },
      }
    }
  }
  const restoreConnection = (id: string): void => {
    const selected = host.session.get(id)
    if (!selected) return
    const { apiKey: selectedKey, board, token: selectedToken } = selected
    apiKey = selectedKey
    token = selectedToken
    state = { ...state, board }
  }
  const handleClick = async (event: Readonly<ViewEvent>): Promise<void> => {
    const providerAction = getProviderAction(event.name)
    if (providerAction) {
      const { error } = state
      state = {
        ...state,
        error: providerAction === 'providers' ? undefined : error,
        providerSelected: providerAction === 'trello',
      }
      return
    }
    if (event.name === 'board-chat')
      await host.execute('chat2.showAiNativeLayout')
    else if (event.name === 'board-ide')
      await host.execute('chat2.showIdeLayout')
    if (
      event.name === 'board-change' ||
      event.name?.startsWith('board-select:')
    ) {
      cancel()
      apiKey = ''
      token = ''
      state = {
        ...state,
        board: undefined,
        boardId: event.name.startsWith('board-select:')
          ? event.name.slice('board-select:'.length)
          : '',
        error: undefined,
        loading: false,
        providerSelected: false,
      }
      const { boardId } = state
      restoreConnection(boardId)
    }
    if (event.name === 'board-disconnect') await disconnect()
  }
  return {
    dispose(): void {
      disposed = true
      cancel()
      apiKey = ''
      token = ''
    },
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      if (event.type === 'input' && typeof event.value === 'string') {
        switch (event.name) {
          case 'board-api-key':
            cancel()
            state = { ...state, loading: false }
            apiKey = event.value.trim()
            break
          case 'board-id':
            cancel()
            state = { ...state, boardId: event.value, loading: false }
            break
          case 'board-token':
            cancel()
            state = { ...state, loading: false }
            token = event.value.trim()
            break
        }
        return
      }
      if (
        (event.type === 'submit' && event.name === 'board-connect') ||
        (event.type === 'click' &&
          ['board-refresh', 'board-retry'].includes(event.name || ''))
      ) {
        // View commands are serialized. Return so the loading frame and final
        // rerender are never queued behind the network request they await.
        void connect()
        return
      }
      if (event.type === 'click') await handleClick(event)
    },
    render: () => render(state),
    renderTitle: (): string => {
      const { board } = state
      return board?.name || 'Boards'
    },
    // Deliberately omit credentials and fetched board contents from saved state.
    saveState: (): unknown => {
      const { boardId } = state
      return { boardId }
    },
  }
}

export const view: View<VirtualDomViewInstance> = {
  create: createInstance,
  displayName: 'Boards',
  icon: 'project',
  id: viewId,
  kind: 'virtualDom',
  title: 'Boards',
}
