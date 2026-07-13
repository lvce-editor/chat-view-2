import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { createInitialState } from '../state/CreateInitialState.ts'

export const logout = async (
  context: TrelloViewActionContext,
): Promise<void> => {
  const { currentBoardStorage, recentStorage, requestRerender, storage } =
    context
  const state = context.state as TrelloViewState
  await storage.delete()
  await recentStorage.delete()
  await currentBoardStorage.delete()
  Object.assign(state, createInitialState())
  requestRerender()
}
