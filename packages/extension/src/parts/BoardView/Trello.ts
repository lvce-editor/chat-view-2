// cspell:words prefs

import {
  resolveBackendConfiguration,
  type BackendConfiguration,
} from '../BackendConfiguration/BackendConfiguration.ts'
import { normalizeDetails, type CardDetails } from './CardDetails.ts'

export interface TrelloCard {
  readonly attachmentCount?: number
  readonly commentCount?: number
  readonly coverDataUrl?: string
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
  readonly backgroundColor?: string
  readonly backgroundGradient?: string
  readonly backgroundImage?: string
  readonly id: string
  readonly name: string
}

export interface TrelloSearchResult {
  readonly boardId?: string
  readonly boardName?: string
  readonly id: string
  readonly kind: 'board' | 'card'
  readonly name: string
}

export interface TrelloBoard {
  readonly backgroundColor?: string
  readonly backgroundGradient?: string
  readonly backgroundImage?: string
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
          'Trello denied access. Connect Trello again and check your access to this board.',
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
const coverPreviewMaxBytes = 1_000_000
const coverImageContentTypePattern = /^image\/(?:avif|gif|jpeg|png|webp)$/u

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
const backgroundColorPattern =
  /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\([\d.,%\s]+\)|[a-z]{1,20})$/iu
const backgroundGradientPattern = /^linear-gradient\([a-z\d#(),.%\s-]+\)$/iu
const dangerousBackgroundGradientPattern = /\b(?:url|var|expression)\b/iu
const safeBackgroundColor = (value: unknown): string | undefined =>
  typeof value === 'string' && backgroundColorPattern.test(value)
    ? value
    : undefined
const safeBackgroundImage = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined
  const url = new URL(value)
  return url.protocol === 'https:' ? url.href : undefined
}
const safeBackgroundGradient = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  backgroundGradientPattern.test(value) &&
  value.includes(',') &&
  !dangerousBackgroundGradientPattern.test(value)
    ? value
    : undefined
const normalizeBoardBackground = (
  value: unknown,
): Pick<
  TrelloBoardSummary,
  'backgroundColor' | 'backgroundGradient' | 'backgroundImage'
> => {
  if (!isRecord(value)) return {}
  const prefs = isRecord(value.prefs) ? value.prefs : undefined
  const backgroundTopColor = safeBackgroundColor(prefs?.backgroundTopColor)
  const backgroundBottomColor = safeBackgroundColor(
    prefs?.backgroundBottomColor,
  )
  const backgroundColor = safeBackgroundColor(
    prefs?.backgroundColor ?? backgroundBottomColor ?? backgroundTopColor,
  )
  const backgroundGradient =
    backgroundTopColor && backgroundBottomColor
      ? `linear-gradient(135deg, ${backgroundTopColor}, ${backgroundBottomColor})`
      : safeBackgroundGradient(prefs?.backgroundGradient ?? prefs?.background)
  const scaledBackgrounds = Array.isArray(prefs?.backgroundImageScaled)
    ? prefs.backgroundImageScaled
    : []
  const largestBackground = scaledBackgrounds.at(-1)
  const backgroundImage = safeBackgroundImage(
    prefs?.backgroundImage ??
      (isRecord(largestBackground) ? largestBackground.url : undefined),
  )
  return {
    ...(backgroundColor && { backgroundColor }),
    ...(backgroundGradient && { backgroundGradient }),
    ...(backgroundImage && { backgroundImage }),
  }
}
const normalizeBoardSummary = (
  value: unknown,
): TrelloBoardSummary | undefined => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !boardIdPattern.test(value.id) ||
    typeof value.name !== 'string'
  )
    return undefined
  return {
    ...normalizeBoardBackground(value),
    id:
      typeof value.shortLink === 'string' &&
      boardIdPattern.test(value.shortLink)
        ? value.shortLink
        : value.id,
    name: value.name,
  }
}
const getResponseError = async (
  response: Response,
  mapError: (status: number) => BoardError,
): Promise<BoardError> => {
  if (response.status !== 403) return mapError(response.status)
  try {
    const body: unknown = await response.json()
    if (isRecord(body) && body.code === 'TRELLO_REAUTHORIZE_REQUIRED') {
      return {
        code: 'TRELLO_REAUTHORIZE_REQUIRED',
        message: 'Reconnect Trello to allow moving cards, then try again.',
      }
    }
  } catch {
    // Keep the safe, generic access error for unreadable responses.
  }
  return mapError(response.status)
}
const isList = (value: unknown): value is TrelloList =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.pos === 'number' &&
  Number.isFinite(value.pos)
const isCard = (
  value: unknown,
): value is TrelloCard & {
  readonly badges?: unknown
  readonly coverDataUrl?: unknown
  readonly cover?: unknown
} => isList(value) && 'idList' in value && typeof value.idList === 'string'

const normalizeCount = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : 0

const isTrelloImageUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !URL.canParse(value)) return false
  const url = new URL(value)
  return (
    url.protocol === 'https:' &&
    (url.hostname === 'trello.com' || url.hostname.endsWith('.trello.com')) &&
    !url.port &&
    !url.username &&
    !url.password
  )
}

type TrelloCoverPreview = Readonly<Record<string, unknown>> & {
  readonly url: string
  readonly width: number
}

const isTrelloCoverPreview = (value: unknown): value is TrelloCoverPreview =>
  isRecord(value) &&
  typeof value.width === 'number' &&
  isTrelloImageUrl(value.url)

const getCoverPreviewUrl = (value: unknown): string | undefined => {
  if (!isRecord(value) || !Array.isArray(value.scaled)) return undefined
  const previews = value.scaled.filter(isTrelloCoverPreview)
  const selected =
    previews.find((preview) => preview.width >= 300) ?? previews.at(-1)
  return selected?.url
}

const toBase64 = (bytes: readonly number[]): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return btoa(binary)
}

const loadCoverDataUrl = async (
  value: unknown,
  accessToken: string,
  signal: Readonly<AbortSignal>,
  request: typeof fetch,
): Promise<string | undefined> => {
  const url = getCoverPreviewUrl(value)
  if (!url) return undefined
  try {
    const response = await request(url, {
      credentials: 'omit',
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    })
    if (!response.ok) return undefined
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]
    if (!contentType || !coverImageContentTypePattern.test(contentType))
      return undefined
    const reader = response.body?.getReader()
    if (!reader) return undefined
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > coverPreviewMaxBytes) {
          await reader.cancel()
          return undefined
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
    if (!length) return undefined
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return `data:${contentType};base64,${toBase64([...bytes])}`
  } catch {
    if (signal.aborted) throw signal.reason
    return undefined
  }
}

const normalizeCard = (
  value: unknown,
  coverDataUrl?: string,
): TrelloCard | undefined => {
  if (!isCard(value)) return undefined
  const normalizedCoverDataUrl = coverDataUrl ?? value.coverDataUrl
  const badges = isRecord(value.badges) ? value.badges : undefined
  return {
    attachmentCount: normalizeCount(badges?.attachments),
    commentCount: normalizeCount(badges?.comments),
    desc: typeof value.desc === 'string' ? value.desc : '',
    id: value.id,
    idList: value.idList,
    name: value.name,
    pos: value.pos,
    ...(typeof normalizedCoverDataUrl === 'string' &&
      normalizedCoverDataUrl.startsWith('data:image/') && {
        coverDataUrl: normalizedCoverDataUrl,
      }),
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
  readonly createCard: (
    idList: string,
    name: string,
    signal: Readonly<AbortSignal>,
  ) => Promise<TrelloCard>
  readonly disconnect: (signal: Readonly<AbortSignal>) => Promise<void>
  readonly load: (
    input: string,
    signal: Readonly<AbortSignal>,
  ) => Promise<TrelloBoard>
  readonly loadCard: (
    id: string,
    signal: Readonly<AbortSignal>,
  ) => Promise<CardDetails>
  readonly moveCard: (
    cardId: string,
    listId: string,
    signal: Readonly<AbortSignal>,
  ) => Promise<void>
  readonly search: (
    query: string,
    signal: Readonly<AbortSignal>,
  ) => Promise<readonly TrelloSearchResult[]>
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
    if (!response.ok)
      throw new TrelloError(await getResponseError(response, mapError))
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
  const getTrelloAccessToken = async (
    signal: Readonly<AbortSignal>,
  ): Promise<string> => {
    const { data } = await call('token', signal)
    if (!isRecord(data) || typeof data.accessToken !== 'string')
      throw new TrelloError(boardError(0))
    return data.accessToken
  }
  const trelloRequest = async (
    path: string,
    signal: Readonly<AbortSignal>,
    accessToken?: string,
  ): Promise<unknown> => {
    const token = accessToken ?? (await getTrelloAccessToken(signal))
    const url = new URL(`/1/${path}`, 'https://api.trello.com')
    const response = await request(url.href, {
      credentials: 'omit',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    })
    if (!response.ok) throw new TrelloError(boardError(response.status))
    return response.json() as Promise<unknown>
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
      const accessToken = await getTrelloAccessToken(signal)
      const data = await trelloRequest(
        `boards/${id}?${new URLSearchParams({
          card_fields: 'name,idList,pos,cover',
          cards: 'open',
          fields: 'name,prefs',
          list_fields: 'name,pos',
          lists: 'open',
        })}`,
        signal,
        accessToken,
      )
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
      const cards: (TrelloCard | undefined)[] = []
      for (let index = 0; index < data.cards.length; index += 4) {
        const batch = data.cards.slice(index, index + 4)
        cards.push(
          ...(await Promise.all(
            batch.map(async (card) => {
              const coverDataUrl = await loadCoverDataUrl(
                isRecord(card) ? card.cover : undefined,
                accessToken,
                signal,
                request,
              )
              return normalizeCard(card, coverDataUrl)
            }),
          )),
        )
      }
      return {
        ...normalizeBoardBackground(data),
        cards: cards
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
  const loadCard = async (
    id: string,
    signal: Readonly<AbortSignal>,
  ): Promise<CardDetails> => {
    if (!cardIdPattern.test(id)) throw new TrelloError(boardError(404))
    try {
      const data = await trelloRequest(
        `cards/${id}?${new URLSearchParams({
          actions: 'commentCard,createCard,updateCard:idList',
          actions_limit: '100',
          attachment_fields: 'name,url',
          attachments: 'true',
          fields: 'desc',
        })}`,
        signal,
      )
      return normalizeDetails(data)
    } catch (error) {
      if (signal.aborted || error instanceof TrelloError) throw error
      throw new TrelloError({
        code: 'TRELLO_CARD_DETAILS_FAILED',
        message: 'Unable to load card details. Try again.',
      })
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
      const data = await trelloRequest(
        `members/me/boards?${new URLSearchParams({
          fields: 'id,name,prefs,shortLink',
          filter: 'open',
        })}`,
        signal,
      )
      if (
        !Array.isArray(data) ||
        data.some((board) => !normalizeBoardSummary(board))
      )
        throw new TrelloError({
          code: 'TRELLO_INVALID_RESPONSE',
          message:
            'Trello returned an unreadable board list. Try again shortly.',
        })
      return data
        .map(normalizeBoardSummary)
        .filter((board): board is TrelloBoardSummary => Boolean(board))
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
  const search = async (
    query: string,
    signal: Readonly<AbortSignal>,
  ): Promise<readonly TrelloSearchResult[]> => {
    const value = query.trim()
    if (!value) return []
    try {
      const data = await trelloRequest(
        `search?${new URLSearchParams({
          board_fields: 'name,shortLink',
          boards_limit: '10',
          card_fields: 'name,idBoard,idList',
          cards_limit: '20',
          modelTypes: 'boards,cards',
          partial: 'true',
          query: value,
        })}`,
        signal,
      )
      if (
        !isRecord(data) ||
        !Array.isArray(data.boards) ||
        !Array.isArray(data.cards)
      )
        throw new TrelloError({
          code: 'TRELLO_INVALID_RESPONSE',
          message:
            'Trello returned unreadable search results. Try again shortly.',
        })
      const boardResults: TrelloSearchResult[] = data.boards.flatMap((item) => {
        const board = normalizeBoardSummary(item)
        return board
          ? [{ id: board.id, kind: 'board' as const, name: board.name }]
          : []
      })
      const cardResults: TrelloSearchResult[] = data.cards.flatMap((item) => {
        if (
          !isRecord(item) ||
          typeof item.id !== 'string' ||
          !cardIdPattern.test(item.id) ||
          typeof item.name !== 'string'
        )
          return []
        const board = isRecord(item.board) ? item.board : undefined
        const directBoardId = item.idBoard
        const nestedBoardId = board?.id
        let boardId: string | undefined
        if (
          typeof directBoardId === 'string' &&
          boardIdPattern.test(directBoardId)
        )
          boardId = directBoardId
        else if (
          typeof nestedBoardId === 'string' &&
          boardIdPattern.test(nestedBoardId)
        )
          boardId = nestedBoardId
        if (!boardId) return []
        return [
          {
            boardId,
            boardName: typeof board?.name === 'string' ? board.name : '',
            id: item.id,
            kind: 'card' as const,
            name: item.name,
          },
        ]
      })
      return [...boardResults, ...cardResults]
    } catch (error) {
      if (signal.aborted || error instanceof TrelloError) throw error
      throw new TrelloError({
        code: 'TRELLO_REQUEST_FAILED',
        message:
          'Unable to search Trello. Check your connection and try again.',
      })
    }
  }
  const createCard = async (
    idList: string,
    name: string,
    signal: Readonly<AbortSignal>,
  ): Promise<TrelloCard> => {
    try {
      const { data } = await call('cards', signal, 'POST', {
        idList,
        name: name.trim(),
      })
      const card = normalizeCard(data)
      if (!card || card.idList !== idList)
        throw new Error('Invalid card response')
      return card
    } catch (error) {
      if (signal.aborted) throw error
      if (
        error instanceof TrelloError &&
        error.details.code === 'TRELLO_ACCESS_DENIED'
      )
        throw new TrelloError({
          code: 'TRELLO_WRITE_DENIED',
          message:
            'Trello rejected this card. Check that you can add cards to this board. If you can, disconnect and reconnect Trello to refresh its access. Your title is still here so you can retry.',
        })
      throw new TrelloError({
        code: 'TRELLO_CREATE_FAILED',
        message:
          'The card could not be confirmed. Refresh the board before trying again to avoid duplicates. Your title has been kept.',
      })
    }
  }
  const moveCard = async (
    cardId: string,
    listId: string,
    signal: Readonly<AbortSignal>,
  ): Promise<void> => {
    if (!cardIdPattern.test(cardId) || !cardIdPattern.test(listId)) {
      throw new TrelloError({
        code: 'TRELLO_INVALID_MOVE',
        message:
          'This card or list could not be identified. Refresh the board.',
      })
    }
    await call(`cards/${cardId}/list/${listId}`, signal, 'PUT')
  }
  return {
    authorize,
    boards,
    createCard,
    disconnect,
    load,
    loadCard,
    moveCard,
    search,
    status,
    updateCard,
  }
}

export const trelloClient = createTrelloClient()
