import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { getErrorMessage } from '../GetErrorMessage.ts'
import { isSameJson } from './CacheFirstHelpers.ts'
import { clearBoardSpecificState } from './ClearBoardSpecificState.ts'

export const submitSearch = async (
  context: TrelloViewActionContext,
): Promise<void> => {
  const { client, requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.credentials || !state.searchEnabled) {
    return
  }
  const query = state.draftSearchQuery.trim()
  state.draftSearchQuery = query
  state.error = ''
  clearBoardSpecificState(state)
  if (!query) {
    state.activeSearchQuery = ''
    state.searchResults = []
    requestRerender()
    return
  }
  state.activeSearchQuery = query
  state.searchResults = []
  state.loading = true
  requestRerender()
  try {
    const result = await client.searchCacheFirst(query, state.credentials)
    if (result.cached) {
      state.searchResults = result.cached
      state.loading = false
      requestRerender()
    }
    const fresh = await result.fresh
    if (state.activeSearchQuery === query) {
      if (!isSameJson(state.searchResults, fresh)) {
        state.searchResults = fresh
      }
      state.loading = false
    }
  } catch (error) {
    state.error = getErrorMessage(error)
  } finally {
    state.loading = false
  }
  requestRerender()
}
