import type {
  TrelloBoard,
  TrelloCard,
  TrelloSearchResult,
} from '../TrelloTypes/TrelloTypes.ts'

export interface TrelloSearchResponse {
  readonly boards?: readonly TrelloBoard[]
  readonly cards?: readonly TrelloCard[]
}

export const normalizeSearchResponse = (
  response: Readonly<TrelloSearchResponse>,
): readonly TrelloSearchResult[] => {
  const cards = response.cards || []
  const boards = response.boards || []
  return [
    ...cards.map((card): TrelloSearchResult => {
      return {
        ...card,
        type: 'card',
      }
    }),
    ...boards.map((board): TrelloSearchResult => {
      return {
        ...board,
        type: 'board',
      }
    }),
  ]
}
