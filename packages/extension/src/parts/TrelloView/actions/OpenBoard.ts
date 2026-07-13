import type { TrelloBoard } from '../../TrelloTypes/TrelloTypes.ts'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { updateRecentBoardViews } from '../../RecentBoardStorage/RecentBoardStorage.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { isSameJson } from './CacheFirstHelpers.ts'
import { resolveBoardCoverImages } from './ResolveBoardCoverImages.ts'

const findBoard = (
  context: TrelloViewActionContext,
  boardId: string,
): TrelloBoard | undefined => {
  const { state } = context
  return (
    state.boards.find((item) => item.id === boardId) ||
    state.searchResults.find(
      (item): item is TrelloBoard & { readonly type: 'board' } => {
        return item.type === 'board' && item.id === boardId
      },
    )
  )
}

export const openBoard = async (
  context: TrelloViewActionContext,
  boardId: string,
): Promise<void> => {
  const { client, currentBoardStorage, recentStorage, requestRerender } =
    context
  const state = context.state as TrelloViewState
  if (!state.credentials) {
    return
  }
  const board = findBoard(context, boardId)
  if (!board) {
    state.error = `Board not found: ${boardId}`
    requestRerender()
    return
  }
  state.loading = true
  state.error = ''
  state.coverImageUrls = {}
  state.selectedCardDetail = undefined
  state.cardAttachmentsLoading = false
  state.cardCommentsLoading = false
  state.cardDetailLoading = false
  state.cardDetailLoadingCardId = ''
  state.addingCardListId = ''
  state.addingCardLabelId = ''
  state.addingList = false
  state.boardLabels = []
  state.boardLabelsLoaded = false
  state.boardLabelsLoading = false
  state.cardLabelPickerOpen = false
  state.draftCardDescription = ''
  state.draftCardTitle = ''
  state.draftComment = ''
  state.draftListTitles = {}
  state.draftLabelSearchQuery = ''
  state.draftNewCardTitle = ''
  state.draftNewListTitle = ''
  state.savingCardDetail = false
  state.savingComment = false
  state.savingNewCard = false
  state.savingNewList = false
  state.writingComment = false
  state.recentBoardViews = updateRecentBoardViews(
    state.recentBoardViews,
    board.id,
    new Date().toISOString(),
  )
  await recentStorage.write(state.recentBoardViews)
  try {
    const result = await client.getBoardDetailCacheFirst(
      board,
      state.credentials,
    )
    if (result.cached) {
      state.boardDetail = result.cached
      state.loading = false
      requestRerender()
      void resolveBoardCoverImages(context, board.id)
    }
    const fresh = await result.fresh
    if (state.loading || state.boardDetail?.board.id === board.id) {
      if (!isSameJson(state.boardDetail, fresh)) {
        state.boardDetail = fresh
      }
      state.loading = false
      void resolveBoardCoverImages(context, board.id)
    }
    await currentBoardStorage.write(board.id)
  } catch (error) {
    state.error = getErrorMessage(error)
    state.loading = false
  }
  requestRerender()
}
