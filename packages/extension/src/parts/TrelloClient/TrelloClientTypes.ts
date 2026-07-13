import type {
  TrelloBoard,
  TrelloBoardDetail,
  TrelloCard,
  TrelloCardCreate,
  TrelloCardDetail,
  TrelloCardMove,
  TrelloCardUpdate,
  TrelloComment,
  TrelloCredentials,
  TrelloLabel,
  TrelloList,
  TrelloListCreate,
  TrelloListUpdate,
  TrelloSearchResult,
} from '../TrelloTypes/TrelloTypes.ts'

export interface TrelloCacheFirstResult<T> {
  readonly cached: T | undefined
  readonly fresh: Promise<T>
}

export interface TrelloCardDetailPartsResult {
  readonly cached: TrelloCardDetail | undefined
  readonly fresh: {
    readonly attachments: Promise<TrelloCardDetail['attachments']>
    readonly card: Promise<TrelloCard>
    readonly comments: Promise<TrelloCardDetail['comments']>
  }
}

export interface TrelloClient {
  readonly addCardComment: (
    card: TrelloCard,
    text: string,
    credentials: TrelloCredentials,
  ) => Promise<TrelloComment>
  readonly addCardLabel: (
    card: TrelloCard,
    label: TrelloLabel,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCard>
  readonly createCard: (
    list: TrelloList,
    create: TrelloCardCreate,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCard>
  readonly createList: (
    board: TrelloBoard,
    create: TrelloListCreate,
    credentials: TrelloCredentials,
  ) => Promise<TrelloList>
  readonly getBoardDetail: (
    board: TrelloBoard,
    credentials: TrelloCredentials,
  ) => Promise<TrelloBoardDetail>
  readonly getBoardDetailCacheFirst: (
    board: TrelloBoard,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCacheFirstResult<TrelloBoardDetail>>
  readonly getCardDetail: (
    card: TrelloCard,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCardDetail>
  readonly getCardDetailCacheFirst: (
    card: TrelloCard,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCacheFirstResult<TrelloCardDetail>>
  readonly getCardDetailPartsCacheFirst: (
    card: TrelloCard,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCardDetailPartsResult>
  readonly listBoardLabels: (
    board: TrelloBoard,
    credentials: TrelloCredentials,
  ) => Promise<readonly TrelloLabel[]>
  readonly listBoards: (
    credentials: TrelloCredentials,
  ) => Promise<readonly TrelloBoard[]>
  readonly listBoardsCacheFirst: (
    credentials: TrelloCredentials,
  ) => Promise<TrelloCacheFirstResult<readonly TrelloBoard[]>>
  readonly moveCard: (
    card: TrelloCard,
    move: TrelloCardMove,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCard>
  readonly search: (
    query: string,
    credentials: TrelloCredentials,
  ) => Promise<readonly TrelloSearchResult[]>
  readonly searchCacheFirst: (
    query: string,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCacheFirstResult<readonly TrelloSearchResult[]>>
  readonly updateCard: (
    card: TrelloCard,
    update: TrelloCardUpdate,
    credentials: TrelloCredentials,
  ) => Promise<TrelloCard>
  readonly updateList: (
    list: TrelloList,
    update: TrelloListUpdate,
    credentials: TrelloCredentials,
  ) => Promise<TrelloList>
}

export interface TrelloResponse {
  readonly json: () => Promise<unknown>
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly text: () => Promise<string>
}

export interface TrelloRequestInit {
  readonly method?: string
}

export type FetchLike = (
  input: string,
  init?: TrelloRequestInit,
) => Promise<TrelloResponse>
