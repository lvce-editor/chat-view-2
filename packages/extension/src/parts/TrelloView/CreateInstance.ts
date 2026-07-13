import type {
  ViewContext,
  ViewEvent,
  ViewSelection,
  VirtualDomViewInstance,
} from '@lvce-editor/api'
import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import type { CredentialStorage } from '../CredentialStorage/CredentialStorage.ts'
import type { CurrentBoardStorage } from '../CurrentBoardStorage/CurrentBoardStorage.ts'
import type { RecentBoardStorage } from '../RecentBoardStorage/RecentBoardStorage.ts'
import type { TrelloClient } from '../TrelloClient/TrelloClient.ts'
import type { TrelloImageCache } from '../TrelloImageCache/TrelloImageCache.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from './state/TrelloViewState.ts'
import { createMemoryCurrentBoardStorage } from '../CurrentBoardStorage/CurrentBoardStorage.ts'
import { createTrelloImageCache } from '../TrelloImageCache/TrelloImageCache.ts'
import {
  cancelAddCard,
  startAddCard,
  submitAddCard,
} from './actions/AddCard.ts'
import { closeCardDetail as closeCardDetailAction } from './actions/CloseCardDetail.ts'
import { goBackToBoards } from './actions/GoBackToBoards.ts'
import { handleBlurEvent } from './actions/HandleBlurEvent.ts'
import { handleClickEvent } from './actions/HandleClickEvent.ts'
import { handleContextMenuEvent } from './actions/HandleContextMenuEvent.ts'
import {
  handleDragEndEvent,
  handleDragLeaveEvent,
  handleDragOverEvent,
  handleDragStartEvent,
  handleDropEvent,
} from './actions/HandleDragEvent.ts'
import { handleFocusEvent } from './actions/HandleFocusEvent.ts'
import { handleInputEvent } from './actions/HandleInputEvent.ts'
import { handleKeyDownEvent } from './actions/HandleKeyDownEvent.ts'
import { handleSubmitEvent } from './actions/HandleSubmitEvent.ts'
import { loadBoards } from './actions/LoadBoards.ts'
import { logout } from './actions/Logout.ts'
import { openCard } from './actions/OpenCard.ts'
import {
  resizeCardDetail,
  startResizeCardDetail,
  stopResizeCardDetail,
} from './actions/ResizeCardDetail.ts'
import { restoreCurrentBoard } from './actions/RestoreCurrentBoard.ts'
import { saveCardDetail as saveCardDetailAction } from './actions/SaveCardDetail.ts'
import { type MenuEntry, getMenuEntries } from './MenuEntries.ts'
import { renderActions, type ViewAction } from './render/RenderActions.ts'
import { renderAuth } from './render/RenderAuth.ts'
import { renderBoardDetail } from './render/RenderBoardDetail.ts'
import { renderBoards } from './render/RenderBoards.ts'
import { renderTitle as renderTrelloTitle } from './render/RenderTitle.ts'
import { createInitialState } from './state/CreateInitialState.ts'
import { dependencyState } from './state/DependencyFactory.ts'
import {
  contextKeyCardDescriptionFocus,
  contextKeyCardLabelPickerFocus,
  contextKeyNewCardInputFocus,
  contextKeyNewListInputFocus,
  updateContext,
} from './state/UpdateContext.ts'

export interface ActiveTrelloViewInstance extends VirtualDomViewInstance {
  readonly addCard: (options: any) => Promise<void>
  readonly addList: (options: any) => Promise<void>
  readonly backToBoards: () => Promise<void>
  readonly cancelNewCard: () => void
  readonly closeCardDetail: () => void
  readonly getContext: () => Readonly<Record<string, boolean>>
  readonly getMenuEntries: (menuId: string) => readonly MenuEntry[]
  readonly logout: () => Promise<void>
  readonly openCard: (cardId: string) => Promise<void>
  readonly openMockBoard: (options: any) => Promise<void>
  readonly refreshBoards: () => Promise<void>
  readonly reload: () => Promise<void>
  readonly renderActions: () => readonly ViewAction[]
  readonly renderFocus: (
    oldContext: Readonly<Record<string, boolean>>,
    newContext: Readonly<Record<string, boolean>>,
  ) => string
  readonly renderSelections: () => readonly ViewSelection[]
  readonly renderTitle: () => string
  readonly saveCardDetail: () => Promise<void>
  readonly startAddCard: (listId: string) => void
  readonly submitNewCard: () => Promise<void>
}

interface MutableTrelloViewActionContext extends TrelloViewActionContext {
  client: TrelloClient
  currentBoardStorage: CurrentBoardStorage
  imageCache: TrelloImageCache
  recentStorage: RecentBoardStorage
  requestRerender: () => void
  showContextMenu: (menuId: string, x: number, y: number) => Promise<void>
  state: TrelloViewState
  storage: CredentialStorage
}

const activeInstances = new Set<ActiveTrelloViewInstance>()

const handlePointerEvent = (
  context: Readonly<TrelloViewActionContext>,
  event: Readonly<ViewEvent>,
): boolean => {
  if (event.type === 'pointerdown' && event.name === 'resizeCardDetail') {
    startResizeCardDetail(context, event)
    return true
  }
  if (event.type === 'pointermove') {
    resizeCardDetail(context, event)
    return true
  }
  if (event.type === 'pointerup') {
    stopResizeCardDetail(context)
    return true
  }
  return false
}

const getActiveInstance = (): ActiveTrelloViewInstance | undefined => {
  let activeInstance: ActiveTrelloViewInstance | undefined
  for (const instance of activeInstances) {
    activeInstance = instance
  }
  return activeInstance
}

const becameActive = (
  oldContext: Readonly<Record<string, boolean>>,
  newContext: Readonly<Record<string, boolean>>,
  key: string,
): boolean => {
  return !oldContext[key] && newContext[key]
}

export const backToBoardsActiveTrelloViewInstance = async (): Promise<void> => {
  await getActiveInstance()?.backToBoards()
}

export const cancelNewCardActiveTrelloViewInstance = (): void => {
  getActiveInstance()?.cancelNewCard()
}

export const addList = async (options: any): Promise<void> => {
  await getActiveInstance()?.addList(options)
}
export const addCard = async (options: any): Promise<void> => {
  await getActiveInstance()?.addCard(options)
}
export const openMockBoard = async (options: any): Promise<void> => {
  await getActiveInstance()?.openMockBoard(options)
}

export const closeCardDetailActiveTrelloViewInstance = (): void => {
  getActiveInstance()?.closeCardDetail()
}

export const logoutActiveTrelloViewInstance = async (): Promise<void> => {
  await getActiveInstance()?.logout()
}

export const refreshBoardsActiveTrelloViewInstance =
  async (): Promise<void> => {
    await getActiveInstance()?.refreshBoards()
  }

export const saveCardDetailActiveTrelloViewInstance =
  async (): Promise<void> => {
    await getActiveInstance()?.saveCardDetail()
  }

export const startAddCardActiveTrelloViewInstance = (listId: string): void => {
  getActiveInstance()?.startAddCard(listId)
}

export const openCardActiveTrelloViewInstance = async (
  cardId: string,
): Promise<void> => {
  await getActiveInstance()?.openCard(cardId)
}

export const submitNewCardActiveTrelloViewInstance =
  async (): Promise<void> => {
    await getActiveInstance()?.submitNewCard()
  }

export const reloadActiveTrelloViewInstances = async (): Promise<void> => {
  await Promise.all(
    activeInstances.values().map((instance) => {
      return instance.reload()
    }),
  )
}

export const createInstance = async (
  context?: ViewContext,
): Promise<ActiveTrelloViewInstance> => {
  const state = createInitialState()
  const viewContext: MutableTrelloViewActionContext = {
    client: undefined as never,
    currentBoardStorage: createMemoryCurrentBoardStorage(),
    imageCache: undefined as never,
    recentStorage: undefined as never,
    requestRerender: undefined as never,
    showContextMenu: undefined as never,
    state,
    storage: undefined as never,
  }

  const requestRerender = (): void => {
    updateContext(state)
    // @ts-ignore
    const request = context?.requestRerender
    if (!request) {
      return
    }
    globalThis.setTimeout(() => {
      void request()
    }, 0)
  }

  const showContextMenu = async (
    menuId: string,
    x: number,
    y: number,
  ): Promise<void> => {
    const request = (context as any)?.showContextMenu
    if (!request) {
      return
    }
    await request(menuId, x, y)
  }

  const initialize = async (rerender: boolean): Promise<void> => {
    const dependencies = dependencyState.factory()
    const {
      client,
      imageCache,
      readBoardBackgroundEnabled,
      readSearchEnabled,
      recentStorage,
      storage,
    } = dependencies
    const currentBoardStorage =
      dependencies.currentBoardStorage || createMemoryCurrentBoardStorage()
    viewContext.imageCache?.dispose()

    Object.assign(state, createInitialState())
    viewContext.client = client
    viewContext.currentBoardStorage = currentBoardStorage
    viewContext.imageCache = imageCache || createTrelloImageCache()
    viewContext.recentStorage = recentStorage
    viewContext.requestRerender = requestRerender
    viewContext.showContextMenu = showContextMenu
    viewContext.storage = storage

    if (readSearchEnabled) {
      state.searchEnabled = await readSearchEnabled()
    }
    if (readBoardBackgroundEnabled) {
      state.boardBackgroundEnabled = await readBoardBackgroundEnabled()
    }
    state.recentBoardViews = await recentStorage.read()
    const storedCredentials = await storage.read()
    if (storedCredentials) {
      state.credentials = storedCredentials
      state.draftApiKey = storedCredentials.apiKey
      state.draftToken = storedCredentials.token
      await loadBoards(viewContext, false)
      await restoreCurrentBoard(viewContext)
    }
    updateContext(state)
    if (rerender) {
      requestRerender()
    }
  }

  await initialize(false)

  const instance: ActiveTrelloViewInstance = {
    async addCard({
      listId,
      name,
    }: {
      readonly name: string
      readonly listId: string
    }): Promise<void> {
      // TODO make this one function
      await instance?.handleEvent?.({
        name: 'startAddList',
        type: 'click',
      })
      await instance?.handleEvent?.({
        name: 'newListTitle',
        type: 'input',
        value: name,
      })
      await instance?.handleEvent?.({
        name: 'addList',
        type: 'submit',
      })
    },
    async addList({ name }: { readonly name: string }): Promise<void> {
      // TODO make this one function
      await instance?.handleEvent?.({
        name: 'startAddList',
        type: 'click',
      })
      await instance?.handleEvent?.({
        name: 'newListTitle',
        type: 'input',
        value: name,
      })
      await instance?.handleEvent?.({
        name: 'addList',
        type: 'submit',
      })
    },
    async backToBoards(): Promise<void> {
      await goBackToBoards(viewContext)
      updateContext(state)
    },
    cancelNewCard(): void {
      cancelAddCard(viewContext)
      updateContext(state)
    },
    closeCardDetail(): void {
      closeCardDetailAction(viewContext)
      updateContext(state)
    },
    async dispose(): Promise<void> {
      activeInstances.delete(instance)
      viewContext.imageCache.dispose()
    },
    getContext(): Readonly<Record<string, boolean>> {
      return state.context
    },
    getMenuEntries(menuId: string): readonly MenuEntry[] {
      return getMenuEntries(state, menuId)
    },
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      activeInstances.delete(instance)
      activeInstances.add(instance)
      state.pendingSelections = []
      try {
        if (event.type === 'focus') {
          handleFocusEvent(viewContext, event)
          return
        }
        if (event.type === 'input') {
          await handleInputEvent(viewContext, event)
          return
        }
        if (event.type === 'keydown') {
          await handleKeyDownEvent(viewContext, event)
          return
        }
        if (handlePointerEvent(viewContext, event)) {
          return
        }
        if (event.type === 'click') {
          await handleClickEvent(viewContext, event)
          return
        }
        if (event.type === 'contextmenu') {
          await handleContextMenuEvent(viewContext, event)
          return
        }
        if (event.type === 'submit') {
          await handleSubmitEvent(viewContext, event)
          return
        }
        if (event.type === 'blur') {
          await handleBlurEvent(viewContext, event)
          if (!event.name || state.focusedName === event.name) {
            state.focusedName = ''
          }
          return
        }
        if (event.type === 'dragstart') {
          handleDragStartEvent(viewContext, event)
          return
        }
        if (event.type === 'dragover') {
          handleDragOverEvent(viewContext, event)
          return
        }
        if (event.type === 'dragleave') {
          handleDragLeaveEvent(viewContext)
          return
        }
        if (event.type === 'dragend') {
          handleDragEndEvent(viewContext)
          return
        }
        if (event.type === 'drop') {
          await handleDropEvent(viewContext, event)
        }
      } finally {
        updateContext(state)
      }
    },
    async logout(): Promise<void> {
      await logout(viewContext)
      updateContext(state)
    },
    async openCard(cardId: string): Promise<void> {
      await openCard(viewContext, cardId)
      updateContext(state)
    },
    async openMockBoard({
      id,
      name,
    }: {
      readonly name: string
      readonly id: string
    }): Promise<void> {
      await instance.handleEvent?.({
        name: 'apiKey',
        type: 'input',
        value: 'abcdefghijklmnopqrstuvwxyz123456',
      })
      await instance.handleEvent?.({
        name: 'token',
        type: 'input',
        value: 'abcdefghijklmnopqrstuvwxyz123456',
      })
      await instance.handleEvent?.({
        name: 'connect',
        type: 'click',
      })
    },
    async refreshBoards(): Promise<void> {
      await loadBoards(viewContext)
      updateContext(state)
    },
    async reload(): Promise<void> {
      await initialize(true)
    },
    render(): readonly VirtualDomNode[] {
      if (!state.credentials) {
        return renderAuth(state)
      }
      if (state.boardDetail) {
        return renderBoardDetail(state, state.boardDetail)
      }
      return renderBoards(state)
    },
    renderActions(): readonly ViewAction[] {
      return renderActions(state)
    },
    renderFocus(
      oldContext: Readonly<Record<string, boolean>>,
      newContext: Readonly<Record<string, boolean>>,
    ): string {
      if (
        becameActive(oldContext, newContext, contextKeyCardLabelPickerFocus)
      ) {
        return '[name="cardLabelSearch"]'
      }
      if (
        becameActive(oldContext, newContext, contextKeyNewCardInputFocus) &&
        state.addingCardListId
      ) {
        return `[name="newCardTitle:${state.addingCardListId}"]`
      }
      if (becameActive(oldContext, newContext, contextKeyNewListInputFocus)) {
        return '[name="newListTitle"]'
      }
      if (
        becameActive(oldContext, newContext, contextKeyCardDescriptionFocus)
      ) {
        return '[name="cardDescription"]'
      }
      return ''
    },
    renderSelections(): readonly ViewSelection[] {
      const selections = state.pendingSelections
      state.pendingSelections = []
      return selections
    },
    renderTitle(): string {
      return renderTrelloTitle(state)
    },
    async saveCardDetail(): Promise<void> {
      await saveCardDetailAction(viewContext)
      updateContext(state)
    },
    saveState(): unknown {
      return {
        boardId: state.boardDetail?.board.id,
        cardId: state.selectedCardDetail?.card.id,
        isAuthenticated: Boolean(state.credentials),
      }
    },
    startAddCard(listId: string): void {
      startAddCard(viewContext, listId)
      updateContext(state)
    },
    async submitNewCard(): Promise<void> {
      if (!state.addingCardListId) {
        return
      }
      await submitAddCard(viewContext, `addCard:${state.addingCardListId}`)
      updateContext(state)
    },
  }
  activeInstances.add(instance)
  return instance
}
