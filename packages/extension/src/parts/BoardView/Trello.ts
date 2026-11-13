import {
  resolveBackendConfiguration,
  type BackendConfiguration,
} from '../BackendConfiguration/BackendConfiguration.ts'

export interface TrelloCard {
  readonly coverUrl?: string
  readonly desc: string
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

export interface TrelloBoardSummary {
  readonly id: string
  readonly name: string
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
          'Trello denied access. Reconnect Trello and allow access to this board.',
      }
    case 409:
      return {
        code: 'TRELLO_CONNECTION_REQUIRED',
        message: 'Connect Trello again to load your boards.',
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

const cardUpdateError = (status: number): BoardError => {
  if (status === 400)
    return {
      code: 'TRELLO_INVALID_CARD',
      message: 'Enter a title and description within Trello’s limits.',
    }
  return boardError(status)
}

const boardUrlPattern =
  /^(?:https:\/\/trello\.com\/b\/)([\dA-Za-z]{8})(?:\/[^?#]*)?(?:[?#].*)?$/u
export const boardIdPattern = /^(?:[\dA-Za-z]{8}|[\da-f]{24})$/u
const cardIdPattern = /^[\da-f]{24}$/u

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
const isCard = (
  value: unknown,
): value is TrelloCard & { readonly cover?: unknown } =>
  isList(value) && 'idList' in value && typeof value.idList === 'string'

const isTrelloCoverUrl = (value: unknown): value is string => {
  return (
    typeof value === 'string' &&
    URL.canParse(value) &&
    new URL(value).protocol === 'https:' &&
    new URL(value).hostname === 'trello.com'
  )
}

const normalizeCard = (value: unknown): TrelloCard | undefined => {
  if (!isCard(value)) return undefined
  const cover = isRecord(value.cover) ? value.cover : undefined
  const coverUrl = cover?.url
  return {
    desc: typeof value.desc === 'string' ? value.desc : '',
    id: value.id,
    idList: value.idList,
    name: value.name,
    pos: value.pos,
    ...(isTrelloCoverUrl(coverUrl) && { coverUrl }),
  }
}

export interface TrelloStatus {
  readonly configured: boolean
  readonly connected: boolean
}

export interface TrelloClient {
  readonly authorize: (signal: Readonly<AbortSignal>) => Promise<string>
  readonly boards: (
    signal: Readonly<AbortSignal>,
  ) => Promise<readonly TrelloBoardSummary[]>
  readonly disconnect: (signal: Readonly<AbortSignal>) => Promise<void>
  readonly load: (
    input: string,
    signal: Readonly<AbortSignal>,
  ) => Promise<TrelloBoard>
  readonly status: (signal: Readonly<AbortSignal>) => Promise<TrelloStatus>
  readonly updateCard: (
    id: string,
    name: string,
    desc: string,
    signal: Readonly<AbortSignal>,
  ) => Promise<TrelloCard>
}

export const createTrelloClient = (
  configuration: () => Promise<BackendConfiguration> = resolveBackendConfiguration,
  request: typeof fetch = fetch,
): TrelloClient => {
  const call = async (
    path: string,
    signal: Readonly<AbortSignal>,
    method = 'GET',
    body?: unknown,
    mapError: (status: number) => BoardError = boardError,
  ): Promise<{ data: unknown; baseUrl: string }> => {
    const config = await configuration()
    if (!config.baseUrl || !config.accessToken)
      throw new TrelloError({
        code: 'TRELLO_LOGIN_REQUIRED',
        message: 'Sign in to LVCE to connect Trello.',
      })
    const url = new URL(`/api/integrations/trello/${path}`, config.baseUrl)
    if (!['https:', 'http:'].includes(url.protocol))
      throw new TrelloError(boardError(0))
    const timeout = path.startsWith('boards/') ? 45_000 : 15_000
    const requestSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(timeout),
    ])
    const send = (token: string): Promise<Response> =>
      request(url.href, {
        credentials: 'omit',
        headers: { Authorization: `Bearer ${token}` },
        method,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        ...(body !== undefined && {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        redirect: 'error',
        signal: requestSignal,
      })
    let response = await send(config.accessToken)
    if (response.status === 401 && config.refreshAccessToken) {
      const token = await config.refreshAccessToken()
      if (token) response = await send(token)
    }
    if (!response.ok) throw new TrelloError(mapError(response.status))
    return {
      baseUrl: config.baseUrl,
      data:
        response.status === 204
          ? undefined
          : ((await response.json()) as unknown),
    }
  }
  const status = async (
    signal: Readonly<AbortSignal>,
  ): Promise<TrelloStatus> => {
    const { data } = await call('status', signal)
    if (
      !isRecord(data) ||
      typeof data.configured !== 'boolean' ||
      typeof data.connected !== 'boolean'
    )
      throw new TrelloError(boardError(0))
    return { configured: data.configured, connected: data.connected }
  }
  const authorize = async (signal: Readonly<AbortSignal>): Promise<string> => {
    const { baseUrl, data } = await call('connect', signal, 'POST')
    const url =
      isRecord(data) && typeof data.url === 'string'
        ? URL.parse(data.url)
        : null
    if (
      !url ||
      url.origin !== new URL(baseUrl).origin ||
      url.pathname !== '/auth/trello/connect' ||
      !url.searchParams.get('ticket')
    )
      throw new TrelloError(boardError(0))
    return url.href
  }
  const disconnect = async (signal: Readonly<AbortSignal>): Promise<void> => {
    await call('disconnect', signal, 'POST')
  }
  const load = async (
    input: string,
    signal: Readonly<AbortSignal>,
  ): Promise<TrelloBoard> => {
    const id = parseBoardId(input)
    try {
      const { data } = await call(`boards/${id}`, signal)
      if (
        !isRecord(data) ||
        typeof data.id !== 'string' ||
        typeof data.name !== 'string' ||
        !Array.isArray(data.lists) ||
        !data.lists.every(isList) ||
        !Array.isArray(data.cards) ||
        data.cards.some((card) => !normalizeCard(card))
      ) {
        throw new TrelloError({
          code: 'TRELLO_INVALID_RESPONSE',
          message: 'Trello returned an unreadable board. Try again shortly.',
        })
      }
      return {
        cards: data.cards
          .map(normalizeCard)
          .filter((card): card is TrelloCard => Boolean(card))
          .toSorted((a, b) => a.pos - b.pos),
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
  const updateCard = async (
    id: string,
    name: string,
    desc: string,
    signal: Readonly<AbortSignal>,
  ): Promise<TrelloCard> => {
    if (!cardIdPattern.test(id)) {
      throw new TrelloError({
        code: 'TRELLO_INVALID_CARD',
        message:
          'This card could not be saved. Refresh the board and try again.',
      })
    }
    try {
      const { data } = await call(
        `cards/${id}`,
        signal,
        'PUT',
        { desc, name },
        cardUpdateError,
      )
      const updatedCard = isRecord(data) ? normalizeCard(data) : undefined
      if (
        !updatedCard ||
        !isRecord(data) ||
        data.id !== id ||
        typeof data.desc !== 'string'
      ) {
        throw new TrelloError({
          code: 'TRELLO_INVALID_RESPONSE',
          message: 'Trello returned an unreadable card. Refresh the board.',
        })
      }
      return { ...updatedCard, desc: data.desc }
    } catch (error) {
      if (signal.aborted) throw error
      if (error instanceof TrelloError) throw error
      throw new TrelloError(boardError(0))
    }
  }
  const boards = async (
    signal: Readonly<AbortSignal>,
  ): Promise<readonly TrelloBoardSummary[]> => {
    try {
      const { data } = await call('boards', signal)
      if (
        !Array.isArray(data) ||
        !data.every(
          (board): board is TrelloBoardSummary =>
            isRecord(board) &&
            typeof board.id === 'string' &&
            boardIdPattern.test(board.id) &&
            typeof board.name === 'string',
        )
      )
        throw new TrelloError({
          code: 'TRELLO_INVALID_RESPONSE',
          message:
            'Trello returned an unreadable board list. Try again shortly.',
        })
      return data
        .map(({ id, name }) => ({ id, name }))
        .toSorted(
          (a: Readonly<TrelloBoardSummary>, b: Readonly<TrelloBoardSummary>) =>
            a.name.localeCompare(b.name),
        )
    } catch (error) {
      if (signal.aborted || error instanceof TrelloError) throw error
      throw new TrelloError({
        code: 'TRELLO_REQUEST_FAILED',
        message:
          'Unable to load your boards. Check your connection and try again.',
      })
    }
  }
  return { authorize, boards, disconnect, load, status, updateCard }
}

export const trelloClient = createTrelloClient()
