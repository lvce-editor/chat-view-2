import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'
import { clearBoardSpecificState } from './ClearBoardSpecificState.ts'

export const goBackToBoards = async (
  context: TrelloViewActionContext,
): Promise<void> => {
  const { currentBoardStorage, requestRerender } = context
  const state = context.state as TrelloViewState
  clearBoardSpecificState(state)
  state.error = ''
  await currentBoardStorage.delete()
  requestRerender()
}
