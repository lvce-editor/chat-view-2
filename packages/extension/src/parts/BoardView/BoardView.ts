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
  trelloClient,
  parseBoardId,
  TrelloError,
} from './Trello.ts'

export const viewId = 'chat2.views.board'
export const connectionsPreference = 'chat2.connectedBoardIds'

export interface BoardHost {
  readonly authorize: typeof trelloClient.authorize
  readonly boards: typeof trelloClient.boards
  readonly execute: typeof executeCommand
  readonly load: typeof trelloClient.load
  readonly read: typeof getPreference
  readonly revoke: typeof trelloClient.disconnect
  readonly session: BoardSession
  readonly status: typeof trelloClient.status
  readonly updateCard: typeof trelloClient.updateCard
  readonly write: typeof setPreference
}
interface BoardViewInstance extends VirtualDomViewInstance {
  readonly handleDialogKeyDown: (key: unknown) => void
}
const defaultHost: BoardHost = {
  authorize: trelloClient.authorize,
  boards: trelloClient.boards,
  execute: executeCommand,
  load: trelloClient.load,
  read: getPreference,
  revoke: trelloClient.disconnect,
  session: createSession(),
  status: trelloClient.status,
  updateCard: trelloClient.updateCard,
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
): Promise<BoardViewInstance> => {
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
    accountConnected: Boolean(connection),
    authorizationUrl: undefined,
    authorizing: false,
    board: connection?.board,
    boardId: initialId,
    boards: [],
    connectedIds,
    error: undefined,
    loading: false,
    providerSelected: false,
  }
  let generation = 0
  let controller: AbortController | undefined
  let disposed = false
  let focusRestore = false
  let focusCardId = ''
  const notify = async (): Promise<void> => {
    if (!disposed) await context?.requestRerender()
  }
  const cancel = (): void => {
    generation++
    controller?.abort()
    state = {
      ...state,
      authorizationUrl: undefined,
      authorizing: false,
      loading: false,
      savingCard: false,
    }
  }
  const closeEditor = (restoreFocus = true): void => {
    const { editingCard } = state
    if (restoreFocus && editingCard) {
      focusCardId = editingCard.id
      focusRestore = !focusRestore
    }
    state = { ...state, editError: undefined, editingCard: undefined }
  }
  const connect = async (): Promise<void> => {
    cancel()
    const requestGeneration = generation
    controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(45_000),
    ])
    state = { ...state, error: undefined, loading: true }
    try {
      const { boardId, connectedIds } = state
      const board = await host.load(boardId, signal)
      if (disposed || requestGeneration !== generation) return
      const id = parseBoardId(boardId)
      host.session.set(id, { board })
      const ids = [...new Set([...connectedIds, id])]
      state = {
        ...state,
        accountConnected: true,
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
        ...(error instanceof TrelloError &&
          error.details.code === 'TRELLO_CONNECTION_REQUIRED' && {
            accountConnected: false,
            board: undefined,
            providerSelected: true,
          }),
      }
    }
    await notify()
  }
  const saveCard = async (): Promise<void> => {
    const {
      board,
      boardId,
      editDesc = '',
      editingCard,
      editName = '',
      savingCard,
    } = state
    if (!board || !editingCard || savingCard || !editName.trim()) return
    cancel()
    const requestGeneration = generation
    controller = new AbortController()
    state = { ...state, editError: undefined, savingCard: true }
    await notify()
    try {
      const updatedCard = await host.updateCard(
        editingCard.id,
        editName,
        editDesc,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      )
      if (disposed || requestGeneration !== generation) return
      const updatedBoard = {
        ...board,
        cards: board.cards.map((card) =>
          card.id === updatedCard.id ? updatedCard : card,
        ),
      }
      host.session.set(boardId, { board: updatedBoard })
      state = {
        ...state,
        board: updatedBoard,
        editError: undefined,
        savingCard: false,
      }
      closeEditor()
    } catch (error) {
      if (disposed || requestGeneration !== generation) return
      state = {
        ...state,
        editError:
          error instanceof TrelloError
            ? error.details.message
            : 'Unable to save this card. Check your connection and try again.',
        savingCard: false,
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
    state = { ...state, accountConnected: true, board: selected.board }
  }
  const connectionError = (error: unknown): void => {
    state = {
      ...state,
      authorizationUrl: undefined,
      authorizing: false,
      error:
        error instanceof TrelloError
          ? error.details
          : {
              code: 'TRELLO_CONNECTION_FAILED',
              message: 'Unable to connect Trello. Try again.',
            },
      loading: false,
      ...(error instanceof TrelloError &&
        error.details.code === 'TRELLO_CONNECTION_REQUIRED' && {
          accountConnected: false,
          boards: [],
        }),
    }
  }
  const loadBoards = async (
    signal: Readonly<AbortSignal>,
    requestGeneration: number,
  ): Promise<void> => {
    if (disposed || generation !== requestGeneration) return
    const boards = await host.boards(signal)
    if (disposed || generation !== requestGeneration) return
    const { boardId } = state
    state = {
      ...state,
      boardId: boards.some((board) => board.id === boardId) ? boardId : '',
      boards,
      loading: false,
    }
  }
  const checkAccount = async (): Promise<void> => {
    cancel()
    const requestGeneration = generation
    controller = new AbortController()
    const { signal } = controller
    state = { ...state, boards: [], error: undefined, loading: true }
    try {
      const result = await host.status(
        AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      )
      if (disposed || generation !== requestGeneration) return
      state = { ...state, accountConnected: result.connected, loading: false }
      if (result.connected) {
        state = { ...state, loading: true }
        await notify()
        await loadBoards(signal, requestGeneration)
      }
      if (!result.configured)
        state = {
          ...state,
          error: {
            code: 'TRELLO_NOT_CONFIGURED',
            message:
              'The server administrator needs to configure Trello OAuth.',
          },
        }
    } catch (error) {
      if (disposed || generation !== requestGeneration) return
      connectionError(error)
    }
    await notify()
  }
  const authorize = async (): Promise<void> => {
    cancel()
    const requestGeneration = generation
    controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(600_000),
    ])
    state = { ...state, authorizing: true, error: undefined }
    try {
      const url = await host.authorize(signal)
      if (disposed || generation !== requestGeneration) return
      state = { ...state, authorizationUrl: url }
      await notify()
      while (!signal.aborted) {
        await new Promise<void>((resolve) => {
          const finish = (): void => {
            clearTimeout(timer)
            signal.removeEventListener('abort', finish)
            resolve()
          }
          const timer = setTimeout(finish, 2000)
          signal.addEventListener('abort', finish, { once: true })
        })
        signal.throwIfAborted()
        const result = await host.status(signal)
        if (disposed || generation !== requestGeneration) return
        if (result.connected) {
          state = {
            ...state,
            accountConnected: true,
            authorizationUrl: undefined,
            authorizing: false,
            loading: true,
          }
          await notify()
          await loadBoards(signal, requestGeneration)
          await notify()
          return
        }
      }
      signal.throwIfAborted()
    } catch (error) {
      if (disposed || generation !== requestGeneration) return
      connectionError(error)
      await notify()
    }
  }
  const revoke = async (): Promise<void> => {
    cancel()
    const requestGeneration = generation
    controller = new AbortController()
    state = { ...state, error: undefined, loading: true }
    try {
      await host.revoke(
        AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      )
      if (disposed || generation !== requestGeneration) return
      const { connectedIds } = state
      for (const id of connectedIds) host.session.remove(id)
      state = {
        ...state,
        accountConnected: false,
        board: undefined,
        boardId: '',
        boards: [],
        loading: false,
        providerSelected: true,
      }
    } catch (error) {
      if (disposed || generation !== requestGeneration) return
      connectionError(error)
    }
    await notify()
  }
  const openCard = (name: string | undefined): void => {
    if (!name?.startsWith('board-card:')) return
    const { board } = state
    const card = board?.cards.find(
      (item) => item.id === name.slice('board-card:'.length),
    )
    if (!card) return
    cancel()
    state = {
      ...state,
      editDesc: card.desc || '',
      editError: undefined,
      editingCard: card,
      editName: card.name,
      savingCard: false,
    }
  }
  const changeBoard = (name: string | undefined): void => {
    if (name !== 'board-change' && !name?.startsWith('board-select:')) return
    cancel()
    state = {
      ...state,
      board: undefined,
      boardId: name.startsWith('board-select:')
        ? name.slice('board-select:'.length)
        : '',
      editError: undefined,
      editingCard: undefined,
      error: undefined,
      loading: false,
      providerSelected: false,
      savingCard: false,
    }
    const { boardId } = state
    restoreConnection(boardId)
    if (boardId && !host.session.get(boardId)) void connect()
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
      if (providerAction === 'trello') void checkAccount()
      else cancel()
      return
    }
    if (event.name?.startsWith('board-card:')) {
      openCard(event.name)
      return
    }
    if (event.name === 'board-card-cancel') {
      cancel()
      closeEditor()
      return
    }
    if (event.name === 'board-chat')
      await host.execute('chat2.showAiNativeLayout')
    else if (event.name === 'board-ide')
      await host.execute('chat2.showIdeLayout')
    changeBoard(event.name)
    if (event.name === 'board-disconnect') await disconnect()
  }
  return {
    dispose(): void {
      disposed = true
      cancel()
    },
    getContext: () => ({ focusRestore }),
    handleDialogKeyDown(key: unknown): void {
      const { editingCard, savingCard } = state
      if (key !== 'Escape' || !editingCard || savingCard) return
      cancel()
      closeEditor()
    },
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      if (event.type === 'input' && typeof event.value === 'string') {
        switch (event.name) {
          case 'board-id':
            cancel()
            state = {
              ...state,
              boardId: event.value,
              error: undefined,
              loading: false,
            }
            break
          case 'edit-card-desc':
            state = { ...state, editDesc: event.value, editError: undefined }
            break
          case 'edit-card-name':
            state = { ...state, editError: undefined, editName: event.value }
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
      if (event.type === 'submit' && event.name === 'board-card-edit') {
        void saveCard()
        return
      }
      if (event.type === 'click') {
        const actions: Readonly<Record<string, () => void | Promise<void>>> = {
          'board-authorize': authorize,
          'board-cancel-authorization': cancel,
          'board-check-account': checkAccount,
          'board-disconnect-account': revoke,
        }
        const action = actions[event.name || '']
        if (action) {
          void action()
          return
        }
      }
      if (event.type === 'click') await handleClick(event)
    },
    render: () => render(state),
    renderFocus: (
      oldContext: Readonly<Record<string, boolean>>,
      newContext: Readonly<Record<string, boolean>>,
    ): string =>
      oldContext.focusRestore === newContext.focusRestore || !focusCardId
        ? ''
        : `[name="board-card:${focusCardId}"]`,
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
  eventListeners: [
    {
      name: 'handleDialogKeyDown',
      params: ['handleDialogKeyDown', 'event.key'],
    },
  ],
  icon: 'project',
  id: viewId,
  kind: 'virtualDom',
  title: 'Boards',
}
