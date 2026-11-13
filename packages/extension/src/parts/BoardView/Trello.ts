import {
  resolveBackendConfiguration,
  type BackendConfiguration,
} from '../BackendConfiguration/BackendConfiguration.ts'

export interface TrelloCard {
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
const isCard = (value: unknown): value is TrelloCard =>
  isList(value) && 'idList' in value && typeof value.idList === 'string'

export interface TrelloStatus {
  readonly configured: boolean
  readonly connected: boolean
}

export interface TrelloClient {
  readonly authorize: (signal: Readonly<AbortSignal>) => Promise<string>
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
      if (
        !isRecord(data) ||
        data.id !== id ||
        typeof data.name !== 'string' ||
        typeof data.desc !== 'string' ||
        typeof data.idList !== 'string' ||
        typeof data.pos !== 'number'
      ) {
        throw new TrelloError({
          code: 'TRELLO_INVALID_RESPONSE',
          message: 'Trello returned an unreadable card. Refresh the board.',
        })
      }
      return {
        desc: data.desc,
        id: data.id,
        idList: data.idList,
        name: data.name,
        pos: data.pos,
      }
    } catch (error) {
      if (signal.aborted) throw error
      if (error instanceof TrelloError) throw error
      throw new TrelloError(boardError(0))
    }
  }
  return { authorize, disconnect, load, status, updateCard }
}

export const trelloClient = createTrelloClient()
