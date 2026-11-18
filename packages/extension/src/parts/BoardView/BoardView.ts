import {
  executeCommand,
  getPreference,
  setPreference,
  type View,
  type ViewContext,
  type ViewEvent,
  type VirtualDomViewInstance,
} from '@lvce-editor/api'
import {
  getBoardHash,
  getUrl,
  isBoardPath,
  parseBoardHash,
} from '../ChatSessionUrl/ChatSessionUrl.ts'
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
  readonly loadCard: typeof trelloClient.loadCard
  readonly moveCard: typeof trelloClient.moveCard
  readonly read: typeof getPreference
  readonly revoke: typeof trelloClient.disconnect
  readonly search: typeof trelloClient.search
  readonly session: BoardSession
  readonly status: typeof trelloClient.status
  readonly updateCard: typeof trelloClient.updateCard
  readonly write: typeof setPreference
}
interface BoardDragHandlers {
  readonly handleBoardDragEnd: () => void
  readonly handleBoardDragOver: (name: string) => void
  readonly handleBoardDragStart: (name: string) => void
  readonly handleBoardDrop: (name: string) => void
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
  loadCard: trelloClient.loadCard,
  moveCard: trelloClient.moveCard,
  read: getPreference,
  revoke: trelloClient.disconnect,
  search: trelloClient.search,
  session: createSession(),
  status: trelloClient.status,
  updateCard: trelloClient.updateCard,
  write: setPreference,
}

const getBoardHashFromHost = async (host: BoardHost): Promise<string> => {
  try {
    const href = await host.execute('Layout.getHref')
    return typeof href === 'string' ? href : ''
  } catch {
    return ''
  }
}

const setBoardHash = async (
  host: BoardHost,
  boardId: string,
): Promise<void> => {
  try {
    const href = await getBoardHashFromHost(host)
    const url = getUrl(href)
    if (!url || !isBoardPath(url.pathname)) return
    await host.execute('Layout.setHash', boardId ? getBoardHash(boardId) : '')
  } catch {
    // Older editor builds do not expose URL commands.
  }
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
  const href = await getBoardHashFromHost(host)
  const boardHash = parseBoardHash(href)
  const urlBoardId =
    boardHash.type === 'board' && boardIdPattern.test(boardHash.id)
      ? boardHash.id
      : ''
  const savedId =
    typeof savedState === 'object' &&
    savedState !== null &&
    'boardId' in savedState &&
    typeof savedState.boardId === 'string'
      ? savedState.boardId
      : ''
  const initialId =
    urlBoardId ||
    (connectedIds.includes(savedId) ? savedId : connectedIds[0] || '')
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
  let searchController: AbortController | undefined
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let searchGeneration = 0
  let moveController: AbortController | undefined
  let disposed = false
  const syncTitle = async (title: string): Promise<void> => {
    await host.execute('WindowTitle.set', title)
  }
  const restoreTitle = async (): Promise<void> =>
    syncTitle(await getWorkspaceTitle(host.execute))
  const { board: initialBoard } = state
  await syncTitle(initialBoard?.name || 'Boards')
  let focusEditor = false
  let focusNewCard = false
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
      await setBoardHash(host, id)
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
    const { detailsError, detailsLoading } = state
    if (detailsLoading || detailsError) return
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
    await setBoardHash(host, '')
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
      searchQuery: '',
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
  const checkAccount = async (automatic = false): Promise<void> => {
    cancel()
    const { providerSelected } = state
    const requestGeneration = generation
    controller = new AbortController()
    const { signal } = controller
    state = {
      ...state,
      boards: [],
      error: undefined,
      loading: true,
    }
    try {
      const result = await host.status(
        AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      )
      if (disposed || generation !== requestGeneration) return
      state = {
        ...state,
        accountConnected: result.connected,
        loading: false,
        providerSelected: result.connected || (!automatic && providerSelected),
      }
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
      if (automatic) state = { ...state, providerSelected: false }
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
    ) {
      state = { ...state, cardDraft: { listId, saving: false, title: '' } }
      focusNewCard = !focusNewCard
    }
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
      case 'board-search':
        const {
          searchError: _previousSearchError,
          ...stateWithoutSearchError
        } = state
        state = {
          ...stateWithoutSearchError,
          searchLoading: Boolean(value.trim()),
          searchQuery: value,
          searchResults: [],
        }
        searchGeneration++
        searchController?.abort()
        if (searchTimer) clearTimeout(searchTimer)
        if (value.trim()) {
          const currentGeneration = searchGeneration
          searchTimer = setTimeout(() => {
            searchController = new AbortController()
            void host
              .search(
                value,
                AbortSignal.any([
                  searchController.signal,
                  AbortSignal.timeout(45_000),
                ]),
              )
              .then((searchResults) => {
                if (disposed || currentGeneration !== searchGeneration) return
                state = { ...state, searchLoading: false, searchResults }
                void notify()
              })
              .catch((error: unknown) => {
                if (
                  disposed ||
                  currentGeneration !== searchGeneration ||
                  searchController?.signal.aborted
                )
                  return
                state = {
                  ...state,
                  searchError:
                    error instanceof TrelloError
                      ? error.details
                      : {
                          code: 'TRELLO_SEARCH_FAILED',
                          message: 'Unable to search Trello. Try again.',
                        },
                  searchLoading: false,
                }
                void notify()
              })
          }, 250)
        }
        break
      case 'edit-card-desc':
        state = { ...state, editDesc: value, editError: undefined }
        break
      case 'edit-card-name':
        state = { ...state, editError: undefined, editName: value }
        break
    }
  }
  const loadCardDetails = async (): Promise<void> => {
    const { editingCard, savingCard } = state
    if (!editingCard || savingCard) return
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    const requestGeneration = ++generation
    state = { ...state, detailsError: undefined, detailsLoading: true }
    try {
      const details = await host.loadCard(editingCard.id, signal)
      if (disposed || signal.aborted || generation !== requestGeneration) return
      state = {
        ...state,
        details,
        detailsLoading: false,
        editDesc: details.desc,
      }
    } catch {
      if (disposed || signal.aborted || generation !== requestGeneration) return
      state = {
        ...state,
        detailsError: 'Unable to load card details. Try again.',
        detailsLoading: false,
      }
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
      details: undefined,
      detailsError: undefined,
      editDesc: card.desc || '',
      editError: undefined,
      editingCard: card,
      editName: card.name,
      savingCard: false,
    }
    focusEditor = !focusEditor
    void loadCardDetails()
  }
  const changeBoard = async (name: string | undefined): Promise<void> => {
    if (name !== 'board-change' && !name?.startsWith('board-select:')) return
    cancel()
    searchGeneration++
    searchController?.abort()
    if (searchTimer) clearTimeout(searchTimer)
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
      optionsOpen: false,
      providerSelected: false,
      savingCard: false,
      searchQuery: '',
    }
    const { boardId } = state
    await setBoardHash(host, boardId)
    await restoreConnection(boardId)
    if (boardId && !host.session.get(boardId)) void connect()
  }
  const openSearchCard = async (id: string): Promise<void> => {
    const { searchResults = [] } = state
    const result = searchResults.find(
      (item) => item.kind === 'card' && item.id === id,
    )
    if (!result?.boardId) return
    cancel()
    const requestGeneration = generation
    controller = new AbortController()
    state = {
      ...state,
      accountConnected: true,
      board: undefined,
      boardId: result.boardId,
      editingCard: undefined,
      error: undefined,
      loading: true,
      searchQuery: '',
    }
    await notify()
    try {
      const board = await host.load(
        result.boardId,
        AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
      )
      if (disposed || requestGeneration !== generation) return
      host.session.set(result.boardId, { board })
      state = { ...state, board, loading: false }
      await syncTitle(board.name)
      await notify()
      openCard(`board-card:${id}`)
    } catch (error) {
      if (disposed || requestGeneration !== generation) return
      state = {
        ...state,
        error:
          error instanceof TrelloError
            ? error.details
            : {
                code: 'TRELLO_REQUEST_FAILED',
                message: 'Unable to load this board. Try again.',
              },
        loading: false,
      }
      await notify()
    }
  }
  const handleClick = async (event: Readonly<ViewEvent>): Promise<void> => {
    if (event.name === 'board-options') {
      const { optionsOpen } = state
      state = { ...state, optionsOpen: !optionsOpen }
      return
    }
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
    if (event.name?.startsWith('board-search-card:')) {
      void openSearchCard(event.name.slice('board-search-card:'.length))
      return
    }
    if (event.name === 'board-card-details-retry') {
      void loadCardDetails()
      return
    }
    if (event.name === 'board-card-cancel') {
      const { savingCard } = state
      if (savingCard) return
      cancel()
      closeEditor()
      return
    }
    await changeBoard(event.name)
    if (event.name === 'board-disconnect') await disconnect()
  }
  const instance: BoardViewInstance = {
    dispose(): void {
      disposed = true
      cancel()
      searchGeneration++
      searchController?.abort()
      if (searchTimer) clearTimeout(searchTimer)
      void (async (): Promise<void> => {
        try {
          await restoreTitle()
        } catch {
          // Ignore title restoration when the host is shutting down.
        }
      })()
    },
    getContext: () => ({ focusEditor, focusNewCard, focusRestore }),
    // View commands are serialized: return before waiting for a rerender
    // queued behind this command, including the optimistic drop frame.
    handleBoardDragEnd(): void {
      void clearDrag()
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
    handleBoardDrop(name: string): void {
      void moveCard(name)
    },
    handleDialogKeyDown(key: unknown): void {
      const { editingCard, optionsOpen, savingCard } = state
      if (key === 'Escape' && optionsOpen) {
        state = { ...state, optionsOpen: false }
        return
      }
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
        state = { ...state, optionsOpen: false }
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
          state = { ...state, optionsOpen: false }
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
    ): string => {
      const { cardDraft, editingCard } = state
      if (oldContext.focusEditor !== newContext.focusEditor && editingCard)
        return '[role="dialog"]'
      if (oldContext.focusNewCard !== newContext.focusNewCard && cardDraft)
        return '[name="board-card-title"]'
      return oldContext.focusRestore === newContext.focusRestore || !focusCardId
        ? ''
        : `[name="board-card:${focusCardId}"]`
    },
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
  if (!initialBoard) {
    if (urlBoardId) void connect()
    else void checkAccount(true)
  }
  return instance
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
