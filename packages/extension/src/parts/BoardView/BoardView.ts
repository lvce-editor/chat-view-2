import {
  executeCommand,
  getPreference,
  setPreference,
  type View,
  type ViewContext,
  type ViewEvent,
  type VirtualDomViewInstance,
} from '@lvce-editor/api'
import { getWorkspaceTitle } from '../ChatView/CreateInstance.ts'
import { createSession, type BoardSession } from './BoardSession.ts'
import { render, type BoardState } from './Render.ts'
import {
  boardIdPattern,
  trelloClient,
  parseBoardId,
  TrelloError,
  type TrelloBoard,
  type TrelloCard,
  type TrelloList,
} from './Trello.ts'

export const viewId = 'chat2.views.board'
export const connectionsPreference = 'chat2.connectedBoardIds'

export interface BoardHost {
  readonly authorize: typeof trelloClient.authorize
  readonly boards: typeof trelloClient.boards
  readonly createCard: typeof trelloClient.createCard
  readonly execute: typeof executeCommand
  readonly load: typeof trelloClient.load
  readonly moveCard: typeof trelloClient.moveCard
  readonly read: typeof getPreference
  readonly revoke: typeof trelloClient.disconnect
  readonly session: BoardSession
  readonly status: typeof trelloClient.status
  readonly updateCard: typeof trelloClient.updateCard
  readonly write: typeof setPreference
}
interface BoardDragHandlers {
  readonly handleBoardDragEnd: () => Promise<void>
  readonly handleBoardDragOver: (name: string) => void
  readonly handleBoardDragStart: (name: string) => void
  readonly handleBoardDrop: (name: string) => Promise<void>
}
interface BoardViewInstance extends VirtualDomViewInstance, BoardDragHandlers {
  readonly handleDialogKeyDown: (key: unknown) => void
}
const getMoveTarget = (
  board: BoardState['board'],
  draggedCardId: string | undefined,
  listName: string,
):
  | {
      readonly board: TrelloBoard
      readonly card: TrelloCard
      readonly destination: TrelloList
    }
  | undefined => {
  if (!board || !draggedCardId) return undefined
  const destinationId = listName.startsWith('board-list:')
    ? listName.slice('board-list:'.length)
    : ''
  const card = board.cards.find(({ id }) => id === draggedCardId)
  const destination = board.lists.find(({ id }) => id === destinationId)
  if (!card || !destination || card.idList === destination.id) return undefined
  return { board, card, destination }
}
const isReauthorizationRequired = (error: unknown): boolean =>
  error instanceof TrelloError &&
  error.details.code === 'TRELLO_REAUTHORIZE_REQUIRED'
const defaultHost: BoardHost = {
  authorize: trelloClient.authorize,
  boards: trelloClient.boards,
  createCard: trelloClient.createCard,
  execute: executeCommand,
  load: trelloClient.load,
  moveCard: trelloClient.moveCard,
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
  let moveController: AbortController | undefined
  let disposed = false
  const syncTitle = async (title: string): Promise<void> => {
    await host.execute('WindowTitle.set', title)
  }
  const restoreTitle = async (): Promise<void> =>
    syncTitle(await getWorkspaceTitle(host.execute))
  const { board: initialBoard } = state
  await syncTitle(initialBoard?.name || 'Boards')
  let focusRestore = false
  let focusCardId = ''
  const notify = async (): Promise<void> => {
    if (!disposed) await context?.requestRerender()
  }
  const clearDrag = async (): Promise<void> => {
    const { draggedCardId, dropTargetId } = state
    if (!draggedCardId && !dropTargetId) return
    state = { ...state, draggedCardId: undefined, dropTargetId: undefined }
    await notify()
  }
  const cancel = (): void => {
    generation++
    controller?.abort()
    moveController?.abort()
    state = {
      ...state,
      authorizationUrl: undefined,
      authorizing: false,
      cardDraft: undefined,
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
    const { board, cardDraft } = state
    const draft = board && !cardDraft?.saving ? cardDraft : undefined
    cancel()
    state = { ...state, cardDraft: draft }
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
      await syncTitle(board.name)
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
  const moveCard = async (listName: string): Promise<void> => {
    const { board: currentBoard, draggedCardId } = state
    const target = getMoveTarget(currentBoard, draggedCardId, listName)
    if (!target) {
      await clearDrag()
      return
    }
    const { board, card, destination } = target
    const { accountConnected, boardId } = state
    const nextBoard = {
      ...board,
      cards: board.cards.map((item) =>
        item.id === card.id ? { ...item, idList: destination.id } : item,
      ),
    }
    const requestGeneration = generation
    const requestController = new AbortController()
    moveController = requestController
    state = {
      ...state,
      board: nextBoard,
      draggedCardId: undefined,
      dropTargetId: undefined,
      error: undefined,
      loading: true,
    }
    await notify()
    try {
      await host.moveCard(card.id, destination.id, requestController.signal)
      if (!disposed && generation === requestGeneration) {
        host.session.set(boardId, { board: nextBoard })
        state = { ...state, loading: false }
      }
    } catch (error) {
      if (!disposed && generation === requestGeneration) {
        state = {
          ...state,
          accountConnected: isReauthorizationRequired(error)
            ? false
            : Boolean(accountConnected),
          board,
          error:
            error instanceof TrelloError
              ? error.details
              : {
                  code: 'TRELLO_MOVE_FAILED',
                  message:
                    'This card could not be moved. Your board is unchanged; try again.',
                },
          loading: false,
        }
      }
    }
    if (moveController === requestController) moveController = undefined
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
  const restoreConnection = async (id: string): Promise<void> => {
    const selected = host.session.get(id)
    if (!selected) {
      await syncTitle('Boards')
      return
    }
    state = { ...state, accountConnected: true, board: selected.board }
    await syncTitle(selected.board.name)
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
      await syncTitle('Boards')
    } catch (error) {
      if (disposed || generation !== requestGeneration) return
      connectionError(error)
    }
    await notify()
  }
  const createCard = async (): Promise<void> => {
    const { board, boardId, cardDraft, editingCard, loading } = state
    if (
      !board ||
      editingCard ||
      !cardDraft ||
      cardDraft.saving ||
      loading ||
      !cardDraft.title.trim() ||
      cardDraft.title.trim().length > 16_384 ||
      board.lists.every((list) => list.id !== cardDraft.listId)
    )
      return
    const requestGeneration = generation
    controller = new AbortController()
    state = {
      ...state,
      cardDraft: { ...cardDraft, error: undefined, saving: true },
    }
    try {
      const card = await host.createCard(
        cardDraft.listId,
        cardDraft.title.trim(),
        AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
      )
      if (disposed || generation !== requestGeneration) return
      const updated = {
        ...board,
        cards: [...board.cards, card].toSorted((a, b) => a.pos - b.pos),
      }
      host.session.set(boardId, { board: updated })
      state = { ...state, board: updated, cardDraft: undefined }
    } catch (error) {
      if (disposed || generation !== requestGeneration) return
      state = {
        ...state,
        cardDraft: {
          ...cardDraft,
          error:
            error instanceof TrelloError
              ? error.details.message
              : 'The card could not be confirmed. Refresh the board before trying again. Your title has been kept.',
          saving: false,
        },
      }
    }
    await notify()
  }
  const openNewCard = (listId: string): void => {
    const { board, cardDraft, editingCard, loading } = state
    if (
      !editingCard &&
      !loading &&
      !cardDraft?.saving &&
      board?.lists.some((list) => list.id === listId)
    )
      state = { ...state, cardDraft: { listId, saving: false, title: '' } }
  }
  const cancelCard = (): void => {
    const { cardDraft } = state
    if (!cardDraft?.saving) state = { ...state, cardDraft: undefined }
  }
  const handleInput = (name: string | undefined, value: string): void => {
    const { cardDraft } = state
    switch (name) {
      case 'board-card-title':
        if (cardDraft && !cardDraft.saving)
          state = { ...state, cardDraft: { ...cardDraft, title: value } }
        break
      case 'board-id':
        cancel()
        state = { ...state, boardId: value, error: undefined, loading: false }
        break
      case 'edit-card-desc':
        state = { ...state, editDesc: value, editError: undefined }
        break
      case 'edit-card-name':
        state = { ...state, editError: undefined, editName: value }
        break
    }
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
  const changeBoard = async (name: string | undefined): Promise<void> => {
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
    await restoreConnection(boardId)
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
    await changeBoard(event.name)
    if (event.name === 'board-disconnect') await disconnect()
  }
  return {
    dispose(): void {
      disposed = true
      cancel()
      void (async (): Promise<void> => {
        try {
          await restoreTitle()
        } catch {
          // Ignore title restoration when the host is shutting down.
        }
      })()
    },
    getContext: () => ({ focusRestore }),
    handleBoardDragEnd(): Promise<void> {
      return clearDrag()
    },
    handleBoardDragOver(name: string): void {
      const { board, draggedCardId, dropTargetId, editingCard, loading } = state
      const listId = name.startsWith('board-list:')
        ? name.slice('board-list:'.length)
        : ''
      if (
        loading ||
        editingCard ||
        !draggedCardId ||
        !board?.lists.some(({ id }) => id === listId) ||
        dropTargetId === listId
      )
        return
      state = { ...state, dropTargetId: listId }
      void notify()
    },
    handleBoardDragStart(name: string): void {
      const { board, editingCard, loading } = state
      const cardId = name.startsWith('board-card:')
        ? name.slice('board-card:'.length)
        : ''
      if (
        loading ||
        editingCard ||
        !board?.cards.some((card) => card.id === cardId)
      )
        return
      state = { ...state, draggedCardId: cardId, dropTargetId: undefined }
      void notify()
    },
    handleBoardDrop(name: string): Promise<void> {
      return moveCard(name)
    },
    handleDialogKeyDown(key: unknown): void {
      const { editingCard, savingCard } = state
      if (key !== 'Escape' || !editingCard || savingCard) return
      cancel()
      closeEditor()
    },
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      if (event.type === 'input' && typeof event.value === 'string') {
        handleInput(event.name, event.value)
        return
      }
      if (event.type === 'submit' && event.name === 'board-create-card') {
        void createCard()
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
        if (event.name?.startsWith('board-add:')) {
          openNewCard(event.name.slice('board-add:'.length))
          return
        }
        const actions: Readonly<Record<string, () => void | Promise<void>>> = {
          'board-authorize': authorize,
          'board-cancel-authorization': cancel,
          'board-cancel-card': cancelCard,
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
      name: 'handleBoardDragStart',
      params: ['handleBoardDragStart', 'event.currentTarget.name'],
    },
    {
      name: 'handleBoardDragOver',
      params: ['handleBoardDragOver', 'event.currentTarget.name'],
      preventDefault: true,
    },
    {
      name: 'handleBoardDrop',
      params: ['handleBoardDrop', 'event.currentTarget.name'],
      preventDefault: true,
    },
    {
      name: 'handleBoardDragEnd',
      params: ['handleBoardDragEnd'],
    },
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
