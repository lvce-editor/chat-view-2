import type { View } from '@lvce-editor/api'
import { viewId } from './Constants.ts'
import {
  type ActiveTrelloViewInstance,
  createInstance,
} from './CreateInstance.ts'
import { renderEventListeners } from './render/RenderEventListeners.ts'

type TrelloView = Omit<View<ActiveTrelloViewInstance>, 'commands'> & {
  readonly commands: NonNullable<View<ActiveTrelloViewInstance>['commands']>
  readonly eventListeners?: ReturnType<typeof renderEventListeners>
}

const runViewAction =
  (action: (instance: ActiveTrelloViewInstance) => Promise<void>) =>
  async (
    instance: ActiveTrelloViewInstance,
  ): Promise<ActiveTrelloViewInstance> => {
    await action(instance)
    return instance
  }

export const view: TrelloView = {
  commands: {
    'trello.backToBoards': runViewAction((instance) => instance.backToBoards()),
    'trello.logout': runViewAction((instance) => instance.logout()),
    'trello.refreshBoards': runViewAction((instance) =>
      instance.refreshBoards(),
    ),
  },
  create: createInstance,
  // @ts-ignore
  displayName: 'Trello',
  eventListeners: renderEventListeners(),
  icon: 'list-tree',
  id: viewId,
  kind: 'virtualDom',
  title: 'Trello',
}

export {
  resetTrelloViewDependencyFactory,
  setTrelloViewDependencyFactory,
} from './state/DependencyFactory.ts'
export {
  backToBoardsActiveTrelloViewInstance,
  cancelNewCardActiveTrelloViewInstance,
  closeCardDetailActiveTrelloViewInstance,
  logoutActiveTrelloViewInstance,
  openCardActiveTrelloViewInstance,
  refreshBoardsActiveTrelloViewInstance,
  reloadActiveTrelloViewInstances,
  saveCardDetailActiveTrelloViewInstance,
  startAddCardActiveTrelloViewInstance,
  submitNewCardActiveTrelloViewInstance,
  addList,
  addCard,
  openMockBoard,
} from './CreateInstance.ts'
export { getMenuEntries } from './MenuEntries.ts'
export { renderActions } from './render/RenderActions.ts'
export {
  boardBackgroundEnabledPreference,
  searchEnabledPreference,
  viewId,
} from './Constants.ts'
