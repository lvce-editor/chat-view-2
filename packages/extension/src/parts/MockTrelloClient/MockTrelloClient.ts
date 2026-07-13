import type { TrelloClient } from '../TrelloClient/TrelloClient.ts'
import type { TrelloCacheFirstResult } from '../TrelloClient/TrelloClientTypes.ts'
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

export interface MockTrelloData {
  readonly boardDetailErrors?: Readonly<Record<string, string>>
  readonly boardDetails?: Readonly<Record<string, TrelloBoardDetail>>
  readonly boardLabels?: Readonly<Record<string, readonly TrelloLabel[]>>
  readonly boards?: readonly TrelloBoard[]
  readonly cardCommentAddErrors?: Readonly<Record<string, string>>
  readonly cardCreateErrors?: Readonly<Record<string, string>>
  readonly cardDetailErrors?: Readonly<Record<string, string>>
  readonly cardDetails?: Readonly<Record<string, TrelloCardDetail>>
  readonly cardLabelAddErrors?: Readonly<Record<string, string>>
  readonly cardMoveErrors?: Readonly<Record<string, string>>
  readonly cardUpdateErrors?: Readonly<Record<string, string>>
  readonly error?: string
  readonly listBoardsError?: string
  readonly listBoardsResponses?: readonly (readonly TrelloBoard[])[]
  readonly listCreateErrors?: Readonly<Record<string, string>>
  readonly listUpdateErrors?: Readonly<Record<string, string>>
  readonly searchError?: string
  readonly searchResults?: readonly TrelloSearchResult[]
}

const getFreshAttachments = async (
  fresh: Readonly<Promise<TrelloCardDetail>>,
): Promise<TrelloCardDetail['attachments']> => {
  const detail = await fresh
  return detail.attachments
}

const getFreshCard = async (
  fresh: Readonly<Promise<TrelloCardDetail>>,
): Promise<TrelloCard> => {
  const detail = await fresh
  return detail.card
}

const getFreshComments = async (
  fresh: Readonly<Promise<TrelloCardDetail>>,
): Promise<TrelloCardDetail['comments']> => {
  const detail = await fresh
  return detail.comments
}

export const createMockTrelloClient = (
  data: Readonly<MockTrelloData>,
): TrelloClient => {
  let listBoardsCallCount = 0
  let addCommentCallCount = 0
  let createCardCallCount = 0
  let createListCallCount = 0
  const cardDetails: Record<string, TrelloCardDetail> = {
    ...data.cardDetails,
  }
  const boardDetails: Record<string, TrelloBoardDetail> = {
    ...data.boardDetails,
  }
  const findCard = (cardId: string): TrelloCard | undefined => {
    const details = Object.values(boardDetails)
    for (const detail of details) {
      for (const list of detail.lists) {
        const card = list.cards.find((item) => item.id === cardId)
        if (card) {
          return card
        }
      }
    }
    return undefined
  }

  const client: TrelloClient = {
    async addCardComment(
      card: TrelloCard,
      text: string,
    ): Promise<TrelloComment> {
      if (data.error) {
        throw new Error(data.error)
      }
      const addError = data.cardCommentAddErrors?.[card.id]
      if (addError) {
        throw new Error(addError)
      }
      addCommentCallCount++
      const comment: TrelloComment = {
        data: {
          text,
        },
        date: '2026-07-07T12:00:00.000Z',
        id: `created-comment-${addCommentCallCount}`,
        memberCreator: {
          fullName: 'Test User',
          initials: 'TU',
        },
      }
      const previousDetail = cardDetails[card.id]
      if (previousDetail) {
        cardDetails[card.id] = {
          ...previousDetail,
          comments: [...previousDetail.comments, comment],
        }
      }
      return comment
    },
    async addCardLabel(
      card: TrelloCard,
      label: TrelloLabel,
      _credentials: TrelloCredentials,
    ): Promise<TrelloCard> {
      if (data.error) {
        throw new Error(data.error)
      }
      const addError = data.cardLabelAddErrors?.[card.id]
      if (addError) {
        throw new Error(addError)
      }
      const previousDetail = cardDetails[card.id]
      const previousCard = previousDetail?.card || findCard(card.id) || card
      const labels = previousCard.labels?.some((item) => {
        return item.id === label.id
      })
        ? previousCard.labels
        : [...(previousCard.labels || []), label]
      const updatedCard = {
        ...previousCard,
        labels,
      }
      cardDetails[card.id] = {
        attachments: previousDetail?.attachments || [],
        card: updatedCard,
        comments: previousDetail?.comments || [],
      }
      for (const [boardId, detail] of Object.entries(boardDetails)) {
        boardDetails[boardId] = {
          ...detail,
          lists: detail.lists.map((list) => {
            return {
              ...list,
              cards: list.cards.map((item) => {
                return item.id === card.id ? { ...item, ...updatedCard } : item
              }),
            }
          }),
        }
      }
      return updatedCard
    },
    async createCard(
      list: TrelloList,
      create: TrelloCardCreate,
    ): Promise<TrelloCard> {
      if (data.error) {
        throw new Error(data.error)
      }
      const createError = data.cardCreateErrors?.[list.id]
      if (createError) {
        throw new Error(createError)
      }
      createCardCallCount++
      const createdCard: TrelloCard = {
        badges: {
          comments: 0,
        },
        id: `created-card-${createCardCallCount}`,
        idList: list.id,
        name: create.name,
      }
      for (const [boardId, detail] of Object.entries(boardDetails)) {
        const hasList = detail.lists.some((item) => {
          return item.id === list.id
        })
        if (!hasList) {
          continue
        }
        boardDetails[boardId] = {
          ...detail,
          lists: detail.lists.map((item) => {
            if (item.id !== list.id) {
              return item
            }
            return {
              ...item,
              cards: [...item.cards, createdCard],
            }
          }),
        }
      }
      cardDetails[createdCard.id] = {
        attachments: [],
        card: createdCard,
        comments: [],
      }
      return createdCard
    },
    async createList(
      board: TrelloBoard,
      create: TrelloListCreate,
    ): Promise<TrelloList> {
      if (data.error) {
        throw new Error(data.error)
      }
      const createError = data.listCreateErrors?.[board.id]
      if (createError) {
        throw new Error(createError)
      }
      createListCallCount++
      const createdList: TrelloList = {
        cards: [],
        id: `created-list-${createListCallCount}`,
        name: create.name,
      }
      const detail = boardDetails[board.id]
      if (detail) {
        boardDetails[board.id] = {
          ...detail,
          lists: [...detail.lists, createdList],
        }
      }
      return createdList
    },
    async getBoardDetail(board: TrelloBoard): Promise<TrelloBoardDetail> {
      if (data.error) {
        throw new Error(data.error)
      }
      const detailError = data.boardDetailErrors?.[board.id]
      if (detailError) {
        throw new Error(detailError)
      }
      const detail = boardDetails[board.id]
      if (!detail) {
        return {
          board,
          lists: [],
        }
      }
      return detail
    },
    async getBoardDetailCacheFirst(
      board: TrelloBoard,
    ): Promise<TrelloCacheFirstResult<TrelloBoardDetail>> {
      return {
        cached: undefined,
        fresh: client.getBoardDetail(board, {
          apiKey: '',
          token: '',
        }),
      }
    },
    async getCardDetail(card: TrelloCard): Promise<TrelloCardDetail> {
      if (data.error) {
        throw new Error(data.error)
      }
      const detailError = data.cardDetailErrors?.[card.id]
      if (detailError) {
        throw new Error(detailError)
      }
      const detail = cardDetails[card.id]
      if (detail) {
        return {
          ...detail,
          comments: detail.comments || [],
        }
      }
      return {
        attachments: [],
        card: findCard(card.id) || card,
        comments: [],
      }
    },
    async getCardDetailCacheFirst(
      card: TrelloCard,
    ): Promise<TrelloCacheFirstResult<TrelloCardDetail>> {
      return {
        cached: undefined,
        fresh: client.getCardDetail(card, {
          apiKey: '',
          token: '',
        }),
      }
    },
    async getCardDetailPartsCacheFirst(card: TrelloCard) {
      const fresh = client.getCardDetail(card, {
        apiKey: '',
        token: '',
      })
      return {
        cached: undefined,
        fresh: {
          attachments: getFreshAttachments(fresh),
          card: getFreshCard(fresh),
          comments: getFreshComments(fresh),
        },
      }
    },
    async listBoardLabels(board: TrelloBoard): Promise<readonly TrelloLabel[]> {
      if (data.error) {
        throw new Error(data.error)
      }
      return data.boardLabels?.[board.id] || []
    },
    async listBoards(): Promise<readonly TrelloBoard[]> {
      if (data.error) {
        throw new Error(data.error)
      }
      if (data.listBoardsError) {
        throw new Error(data.listBoardsError)
      }
      const scriptedResponse = data.listBoardsResponses?.[listBoardsCallCount]
      listBoardsCallCount++
      if (scriptedResponse) {
        return scriptedResponse
      }
      return data.boards || []
    },
    async listBoardsCacheFirst(): Promise<
      TrelloCacheFirstResult<readonly TrelloBoard[]>
    > {
      return {
        cached: undefined,
        fresh: client.listBoards({
          apiKey: '',
          token: '',
        }),
      }
    },
    async moveCard(
      card: TrelloCard,
      move: TrelloCardMove,
    ): Promise<TrelloCard> {
      if (data.error) {
        throw new Error(data.error)
      }
      const moveError = data.cardMoveErrors?.[card.id]
      if (moveError) {
        throw new Error(moveError)
      }
      const existingCard = findCard(card.id) || card
      const movedCard = {
        ...existingCard,
        idList: move.idList,
      }
      for (const [boardId, detail] of Object.entries(boardDetails)) {
        const hasCard = detail.lists.some((list) => {
          return list.cards.some((item) => item.id === card.id)
        })
        if (!hasCard) {
          continue
        }
        boardDetails[boardId] = {
          ...detail,
          lists: detail.lists.map((list) => {
            const cardsWithoutMoved = list.cards.filter((item) => {
              return item.id !== card.id
            })
            if (list.id !== move.idList) {
              return {
                ...list,
                cards: cardsWithoutMoved,
              }
            }
            return {
              ...list,
              cards:
                move.pos === 'top'
                  ? [movedCard, ...cardsWithoutMoved]
                  : [...cardsWithoutMoved, movedCard],
            }
          }),
        }
      }
      const previousDetail = cardDetails[card.id]
      if (previousDetail) {
        cardDetails[card.id] = {
          ...previousDetail,
          card: {
            ...previousDetail.card,
            idList: move.idList,
          },
        }
      }
      return movedCard
    },
    async search(): Promise<readonly TrelloSearchResult[]> {
      if (data.error) {
        throw new Error(data.error)
      }
      if (data.searchError) {
        throw new Error(data.searchError)
      }
      return data.searchResults || []
    },
    async searchCacheFirst(): Promise<
      TrelloCacheFirstResult<readonly TrelloSearchResult[]>
    > {
      return {
        cached: undefined,
        fresh: client.search('', {
          apiKey: '',
          token: '',
        }),
      }
    },
    async updateCard(
      card: TrelloCard,
      update: TrelloCardUpdate,
    ): Promise<TrelloCard> {
      if (data.error) {
        throw new Error(data.error)
      }
      const updateError = data.cardUpdateErrors?.[card.id]
      if (updateError) {
        throw new Error(updateError)
      }
      const previousDetail = cardDetails[card.id]
      const previousCard = previousDetail?.card || findCard(card.id) || card
      const updatedCard = {
        ...previousCard,
        desc: update.desc,
        name: update.name,
      }
      cardDetails[card.id] = {
        attachments: previousDetail?.attachments || [],
        card: updatedCard,
        comments: previousDetail?.comments || [],
      }
      return updatedCard
    },
    async updateList(
      list: TrelloList,
      update: TrelloListUpdate,
    ): Promise<TrelloList> {
      if (data.error) {
        throw new Error(data.error)
      }
      const updateError = data.listUpdateErrors?.[list.id]
      if (updateError) {
        throw new Error(updateError)
      }
      const updatedList = {
        ...list,
        name: update.name,
      }
      for (const [boardId, detail] of Object.entries(boardDetails)) {
        boardDetails[boardId] = {
          ...detail,
          lists: detail.lists.map((item) => {
            return item.id === list.id ? updatedList : item
          }),
        }
      }
      return updatedList
    },
  }
  return client
}
