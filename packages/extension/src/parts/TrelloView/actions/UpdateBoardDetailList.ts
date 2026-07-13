import type { TrelloList } from '../../TrelloTypes/TrelloTypes.ts'
import type { TrelloViewState } from '../state/TrelloViewState.ts'

export const updateBoardDetailList = (
  state: Readonly<TrelloViewState>,
  list: Readonly<TrelloList>,
): void => {
  const mutableState = state as TrelloViewState
  if (!mutableState.boardDetail) {
    return
  }
  mutableState.boardDetail = {
    ...mutableState.boardDetail,
    lists: mutableState.boardDetail.lists.map((item) => {
      return item.id === list.id ? list : item
    }),
  }
}
