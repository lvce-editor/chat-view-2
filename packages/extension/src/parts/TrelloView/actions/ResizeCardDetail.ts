import type { ViewEvent } from '@lvce-editor/api'
import type {
  TrelloViewActionContext,
  TrelloViewState,
} from '../state/TrelloViewState.ts'

const minCardDetailWidth = 200

const getEventNumber = (event: Readonly<ViewEvent>, key: string): number => {
  const value = (event as unknown as Readonly<Record<string, unknown>>)[key]
  if (typeof value === 'number') {
    return value
  }
  return 0
}

export const startResizeCardDetail = (
  context: Readonly<TrelloViewActionContext>,
  event: Readonly<ViewEvent>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  state.resizingCardDetail = true
  state.cardDetailResizeStartX = getEventNumber(event, 'clientX')
  state.cardDetailResizeStartWidth = state.cardDetailWidth
  requestRerender()
}

export const resizeCardDetail = (
  context: Readonly<TrelloViewActionContext>,
  event: Readonly<ViewEvent>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.resizingCardDetail) {
    return
  }
  const clientX = getEventNumber(event, 'clientX')
  const delta = clientX - state.cardDetailResizeStartX
  state.cardDetailWidth = Math.max(
    minCardDetailWidth,
    state.cardDetailResizeStartWidth - delta,
  )
  requestRerender()
}

export const stopResizeCardDetail = (
  context: Readonly<TrelloViewActionContext>,
): void => {
  const { requestRerender } = context
  const state = context.state as TrelloViewState
  if (!state.resizingCardDetail) {
    return
  }
  state.resizingCardDetail = false
  requestRerender()
}
