import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { isSameJson } from './CacheFirstHelpers.ts'
import { clearBoardSpecificState } from './ClearBoardSpecificState.ts'

export const loadBoards = async (
  context: TrelloViewActionContext,
  rerender = true,
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials) {
    return
  }
  state.loading = true
  state.error = ''
  clearBoardSpecificState(state)
  state.activeSearchQuery = ''
  state.searchResults = []
  try {
    const result = await client.listBoardsCacheFirst(state.credentials)
    if (result.cached) {
      state.boards = result.cached
      state.loading = false
      if (rerender) {
        requestRerender()
      }
    }
    const fresh = await result.fresh
    if (!isSameJson(state.boards, fresh)) {
      state.boards = fresh
    }
  } catch (error) {
    state.error = getErrorMessage(error)
  } finally {
    state.loading = false
  }
  if (rerender) {
    requestRerender()
  }
}
