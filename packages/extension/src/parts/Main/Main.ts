import {
  activate as activateExtensionApi,
  executeCommand,
  registerCommand,
  registerView,
} from '@lvce-editor/api'
import {
  createCacheCredentialStorage,
  testCacheName as testCredentialCacheName,
} from '../CredentialStorage/CredentialStorage.ts'
import {
  createCacheCurrentBoardStorage,
  testCacheName as testCurrentBoardCacheName,
} from '../CurrentBoardStorage/CurrentBoardStorage.ts'
import {
  createMockTrelloClient,
  type MockTrelloData,
} from '../MockTrelloClient/MockTrelloClient.ts'
import {
  createCacheRecentBoardStorage,
  testCacheName as testRecentBoardCacheName,
} from '../RecentBoardStorage/RecentBoardStorage.ts'
import { clearTrelloTestCaches } from '../TestStorage/TestStorage.ts'
import * as TrelloView from '../TrelloView/TrelloView.ts'

const state = {
  isActivated: false,
}

export const activate = async (): Promise<void> => {
  if (state.isActivated) {
    return
  }
  state.isActivated = true
  await activateExtensionApi()
  registerView(TrelloView.view)
  registerCommand({
    execute() {
      return executeCommand('SideBar.show', TrelloView.viewId, true)
    },
    id: 'trello.show',
  })
  registerCommand({
    execute() {
      return TrelloView.cancelNewCardActiveTrelloViewInstance()
    },
    id: 'trello.cancelNewCard',
  })
  registerCommand({
    execute() {
      return TrelloView.closeCardDetailActiveTrelloViewInstance()
    },
    id: 'trello.closeCardDetail',
  })
  registerCommand({
    execute(cardId: string) {
      return TrelloView.openCardActiveTrelloViewInstance(cardId)
    },
    id: 'trello.openCard',
  })
  registerCommand({
    execute() {
      return TrelloView.saveCardDetailActiveTrelloViewInstance()
    },
    id: 'trello.saveCardDetail',
  })
  registerCommand({
    execute(listId: string) {
      return TrelloView.startAddCardActiveTrelloViewInstance(listId)
    },
    id: 'trello.startAddCard',
  })
  registerCommand({
    execute() {
      return TrelloView.submitNewCardActiveTrelloViewInstance()
    },
    id: 'trello.submitNewCard',
  })
  registerCommand({
    execute(options: any) {
      return TrelloView.addList(options)
    },
    id: 'trello.addList',
  })
  registerCommand({
    execute(options: any) {
      return TrelloView.openMockBoard(options)
    },
    id: 'trello.openMockBoard',
  })
  registerCommand({
    execute(options: any) {
      return TrelloView.addCard(options)
    },
    id: 'trello.addCard',
  })
  registerCommand({
    async execute(data: Readonly<MockTrelloData>) {
      await clearTrelloTestCaches()
      TrelloView.setTrelloViewDependencyFactory(() => ({
        client: createMockTrelloClient(data),
        currentBoardStorage: createCacheCurrentBoardStorage(
          testCurrentBoardCacheName,
        ),
        isTest: true,
        recentStorage: createCacheRecentBoardStorage(testRecentBoardCacheName),
        storage: createCacheCredentialStorage(testCredentialCacheName),
      }))
      await TrelloView.reloadActiveTrelloViewInstances()
      return { ok: true }
    },
    id: 'trello.test.useMockData',
  })
  registerCommand({
    async execute() {
      TrelloView.resetTrelloViewDependencyFactory()
      await TrelloView.reloadActiveTrelloViewInstances()
      return { ok: true }
    },
    id: 'trello.test.reset',
  })
}

export const deactivate = (): void => {}
