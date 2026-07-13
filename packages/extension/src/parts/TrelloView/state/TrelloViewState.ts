import type { ViewSelection } from '@lvce-editor/api'
import type { CredentialStorage } from '../../CredentialStorage/CredentialStorage.ts'
import type { CurrentBoardStorage } from '../../CurrentBoardStorage/CurrentBoardStorage.ts'
import type {
  RecentBoardStorage,
  RecentBoardView,
} from '../../RecentBoardStorage/RecentBoardStorage.ts'
import type { TrelloClient } from '../../TrelloClient/TrelloClient.ts'
import type { TrelloImageCache } from '../../TrelloImageCache/TrelloImageCache.ts'
import type {
  TrelloBoard,
  TrelloBoardDetail,
  TrelloCardDetail,
  TrelloCredentials,
  TrelloLabel,
  TrelloSearchResult,
} from '../../TrelloTypes/TrelloTypes.ts'

export interface TrelloViewDependencies {
  readonly client: TrelloClient
  readonly currentBoardStorage?: CurrentBoardStorage
  readonly imageCache?: TrelloImageCache
  readonly isTest?: boolean
  readonly readBoardBackgroundEnabled?: () => Promise<boolean>
  readonly readSearchEnabled?: () => Promise<boolean>
  readonly recentStorage: RecentBoardStorage
  readonly storage: CredentialStorage
}

export interface TrelloViewState {
  activeSearchQuery: string
  addingCardLabelId: string
  addingCardListId: string
  addingList: boolean
  baseUrl: string
  boardBackgroundEnabled: boolean
  boardDetail: TrelloBoardDetail | undefined
  boardLabels: readonly TrelloLabel[]
  boardLabelsLoaded: boolean
  boardLabelsLoading: boolean
  boards: readonly TrelloBoard[]
  cardAttachmentsLoading: boolean
  cardCommentsLoading: boolean
  cardDetailLoading: boolean
  cardDetailLoadingCardId: string
  cardDetailResizeStartWidth: number
  cardDetailResizeStartX: number
  cardDetailWidth: number
  cardLabelPickerOpen: boolean
  context: Readonly<Record<string, boolean>>
  contextMenuCardId: string
  contextMenuListId: string
  coverImageUrls: Readonly<Record<string, string>>
  credentials: TrelloCredentials | undefined
  draftApiKey: string
  draftCardDescription: string
  draftCardTitle: string
  draftComment: string
  draftLabelSearchQuery: string
  draftListTitles: Readonly<Record<string, string>>
  draftNewCardTitle: string
  draftNewListTitle: string
  draftSearchQuery: string
  draftToken: string
  draggedCardId: string
  dragTargetListId: string
  editingCardDescription: boolean
  editingCardTitle: boolean
  error: string
  focusedName: string
  loading: boolean
  movingCardId: string
  pendingSelections: readonly ViewSelection[]
  recentBoardViews: readonly RecentBoardView[]
  resizingCardDetail: boolean
  savingCardDetail: boolean
  savingComment: boolean
  savingNewCard: boolean
  savingNewList: boolean
  searchEnabled: boolean
  searchResults: readonly TrelloSearchResult[]
  selectedCardDetail: TrelloCardDetail | undefined
  writingComment: boolean
}

export interface TrelloViewContext {
  readonly client: TrelloClient
  readonly currentBoardStorage: CurrentBoardStorage
  readonly imageCache: TrelloImageCache
  readonly recentStorage: RecentBoardStorage
  readonly requestRerender: () => void
  readonly showContextMenu: (
    menuId: string,
    x: number,
    y: number,
  ) => Promise<void>
  readonly state: TrelloViewState
  readonly storage: CredentialStorage
}

export interface TrelloViewActionContext {
  readonly client: TrelloClient
  readonly currentBoardStorage: CurrentBoardStorage
  readonly imageCache: TrelloImageCache
  readonly recentStorage: RecentBoardStorage
  readonly requestRerender: () => void
  readonly showContextMenu: (
    menuId: string,
    x: number,
    y: number,
  ) => Promise<void>
  readonly state: Readonly<TrelloViewState>
  readonly storage: CredentialStorage
}
