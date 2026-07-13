import type { TrelloBoardDetail } from '../../TrelloTypes/TrelloTypes.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getCardCoverImageUrl } from '../CardCoverHelpers.ts'

const getBoardCoverImageUrls = (
  detail: Readonly<TrelloBoardDetail>,
): readonly string[] => {
  const urls = new Set<string>()
  for (const list of detail.lists) {
    for (const card of list.cards) {
      const url = getCardCoverImageUrl(card)
      if (url) {
        urls.add(url)
      }
    }
  }
  return [...urls]
}

const resolveCoverImageUrl = async (
  context: TrelloViewActionContext,
  url: string,
): Promise<readonly [string, string]> => {
  try {
    return [url, await context.imageCache.resolveImageUrl(url)]
  } catch {
    return [url, '']
  }
}

export const resolveBoardCoverImages = async (
  context: TrelloViewActionContext,
  boardId: string,
): Promise<void> => {
  const state = context.state as TrelloViewState
  const detail = state.boardDetail
  if (!detail || detail.board.id !== boardId) {
    return
  }
  const unresolvedUrls = getBoardCoverImageUrls(detail).filter((url) => {
    return !state.coverImageUrls[url]
  })
  if (unresolvedUrls.length === 0) {
    return
  }
  const resolvedUrls = await Promise.all(
    unresolvedUrls.map((url) => {
      return resolveCoverImageUrl(context, url)
    }),
  )
  if (state.boardDetail?.board.id !== boardId) {
    return
  }
  const nextCoverImageUrls = { ...state.coverImageUrls }
  let changed = false
  for (const [sourceUrl, objectUrl] of resolvedUrls) {
    if (!objectUrl) {
      continue
    }
    nextCoverImageUrls[sourceUrl] = objectUrl
    changed = true
  }
  if (changed) {
    state.coverImageUrls = nextCoverImageUrls
    context.requestRerender()
  }
}
