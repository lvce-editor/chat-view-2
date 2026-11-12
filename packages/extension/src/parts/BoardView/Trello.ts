export interface TrelloCard {
  readonly id: string
  readonly idList: string
  readonly name: string
  readonly pos: number
}

export interface TrelloList {
  readonly id: string
  readonly name: string
  readonly pos: number
}

export interface TrelloBoard {
  readonly cards: readonly TrelloCard[]
  readonly id: string
  readonly lists: readonly TrelloList[]
  readonly name: string
}

export interface BoardError {
  readonly code: string
  readonly message: string
}

export class TrelloError extends Error {
  constructor(readonly details: BoardError) {
    super(details.message)
  }
}

export const boardError = (status: number): BoardError => {
  switch (status) {
    case 400:
    case 404:
      return {
        code: 'TRELLO_BOARD_NOT_FOUND',
        message:
          'This board could not be found. Check its URL or ID and your access to it.',
      }
    case 401:
    case 403:
      return {
        code: 'TRELLO_ACCESS_DENIED',
        message:
          'Trello denied access. Check your API key and token, and make sure your account can open this board.',
      }
    case 429:
      return {
        code: 'TRELLO_RATE_LIMITED',
        message:
          'Trello is receiving too many requests. Wait a moment, then try again.',
      }
    default:
      return status >= 500
        ? {
            code: 'TRELLO_SERVER_ERROR',
            message: 'Trello is temporarily unavailable. Try again shortly.',
          }
        : {
            code: 'TRELLO_REQUEST_FAILED',
            message:
              'Unable to load this board. Check your connection and try again.',
          }
  }
}

const boardUrlPattern =
  /^(?:https:\/\/trello\.com\/b\/)([\dA-Za-z]{8})(?:\/[^?#]*)?(?:[?#].*)?$/u
export const boardIdPattern = /^(?:[\dA-Za-z]{8}|[\da-f]{24})$/u
const apiKeyPattern = /^[\dA-Za-z]+$/u
const tokenPattern = /^[\dA-Za-z_-]+$/u

export const parseBoardId = (input: string): string => {
  const value = input.trim()
  const match = boardUrlPattern.exec(value)
  const id = match?.[1] || value
  if (!boardIdPattern.test(id)) {
    throw new TrelloError({
      code: 'TRELLO_INVALID_BOARD',
      message:
        'Enter a Trello board URL, eight-character short ID, or full board ID.',
    })
  }
  return id
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isList = (value: unknown): value is TrelloList =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.pos === 'number' &&
  Number.isFinite(value.pos)
const isCard = (value: unknown): value is TrelloCard =>
  isList(value) && 'idList' in value && typeof value.idList === 'string'

export const loadBoard = async (
  input: string,
  apiKey: string,
  token: string,
  signal: Readonly<AbortSignal>,
  request: typeof fetch = fetch,
): Promise<TrelloBoard> => {
  if (!apiKeyPattern.test(apiKey) || !tokenPattern.test(token)) {
    throw new TrelloError({
      code: 'TRELLO_CREDENTIALS_REQUIRED',
      message:
        'Enter your Trello API key and a token with read access. Credentials are kept only for this session.',
    })
  }
  const id = parseBoardId(input)
  try {
    const response = await request(
      `https://api.trello.com/1/boards/${id}?fields=name&lists=open&list_fields=name,pos&cards=open&card_fields=name,idList,pos`,
      {
        headers: {
          Authorization: `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`,
        },
        signal,
      },
    )
    if (!response.ok) throw new TrelloError(boardError(response.status))
    const data: unknown = await response.json()
    if (
      !isRecord(data) ||
      typeof data.id !== 'string' ||
      typeof data.name !== 'string' ||
      !Array.isArray(data.lists) ||
      !data.lists.every(isList) ||
      !Array.isArray(data.cards) ||
      !data.cards.every(isCard)
    ) {
      throw new TrelloError({
        code: 'TRELLO_INVALID_RESPONSE',
        message: 'Trello returned an unreadable board. Try again shortly.',
      })
    }
    return {
      cards: data.cards.toSorted((a, b) => a.pos - b.pos),
      id: data.id,
      lists: data.lists.toSorted((a, b) => a.pos - b.pos),
      name: data.name,
    }
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof TrelloError) throw error
    throw new TrelloError(boardError(0))
  }
}
