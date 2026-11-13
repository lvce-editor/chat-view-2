import {
  activate as activateExtensionApi,
  executeCommand,
  registerCommand,
  registerView,
} from '@lvce-editor/api'
import {
  view as boardView,
  viewId as boardViewId,
} from '../BoardView/BoardView.ts'
import {
  getUrl,
  isBoardPath,
  isChatPath,
  parseChatTaskHash,
} from '../ChatSessionUrl/ChatSessionUrl.ts'
import { view, viewId } from '../ChatView/ChatView.ts'
import {
  getActiveChatQuickPickItems,
  newChatInActiveChatViewInstance,
  openActiveChatQuickPickItem,
  setWorkbenchLayoutUrl,
  submitActiveChatViewInstance,
  toggleActiveChatViewFocusMode,
  toggleActiveChatViewSessionsList,
} from '../ChatView/CreateInstance.ts'
import { headlessChatCommands } from '../HeadlessChat/HeadlessChat.ts'

const state = {
  activated: false,
}

export const activate = async (): Promise<void> => {
  if (state.activated) {
    return
  }
  state.activated = true
  await activateExtensionApi()
  registerView(view)
  registerView(boardView)
  registerCommand({
    async execute() {
      await executeCommand('Layout.leaveSideBarFocusMode')
      await setWorkbenchLayoutUrl(executeCommand, 'board')
      await executeCommand('SideBar.show', boardViewId, true)
      await executeCommand('Layout.enterSideBarFocusMode', 'primary', true)
    },
    id: 'chat2.showBoardLayout',
  })
  registerCommand({
    async execute() {
      await executeCommand('Layout.leaveSideBarFocusMode')
      await setWorkbenchLayoutUrl(executeCommand, 'ai-native')
      await executeCommand('SideBar.show', viewId, true)
      await toggleActiveChatViewFocusMode()
    },
    id: 'chat2.showAiNativeLayout',
  })
  registerCommand({
    async execute() {
      await executeCommand('Layout.leaveSideBarFocusMode')
      await setWorkbenchLayoutUrl(executeCommand, 'ide')
      await executeCommand('SideBar.show', viewId, true)
    },
    id: 'chat2.showIdeLayout',
  })
  registerCommand({
    async execute(modelId?: unknown) {
      return headlessChatCommands.createSession(modelId)
    },
    id: 'chat2.createSession',
  })
  registerCommand({
    async execute(
      message: unknown,
      modelId?: unknown,
      fileSystemAccess?: unknown,
      accessToken?: unknown,
    ) {
      return headlessChatCommands.runPrompt(
        message,
        modelId,
        fileSystemAccess,
        accessToken,
      )
    },
    id: 'chat2.runPrompt',
  })
  registerCommand({
    async execute(message: unknown) {
      return headlessChatCommands.sendMessage(message)
    },
    id: 'chat2.sendMessage',
  })
  registerCommand({
    async execute() {
      await executeCommand('SideBar.show', viewId, true)
      await newChatInActiveChatViewInstance()
    },
    id: 'chat2.newChat',
  })
  registerCommand({
    execute() {
      return executeCommand('SideBar.show', viewId, true)
    },
    id: 'chat2.show',
  })
  registerCommand({
    execute() {
      return submitActiveChatViewInstance()
    },
    id: 'chat2.submit',
  })
  for (const id of ['chat2.toggleFocusMode', 'chat2.toggleAiNativeLayout']) {
    registerCommand({
      async execute() {
        if (
          !(await executeCommand('Layout.getSideBarFocusMode')) ||
          (await executeCommand('Layout.getActiveSideBarView')) === boardViewId
        ) {
          await executeCommand('SideBar.show', viewId, true)
        }
        await toggleActiveChatViewFocusMode()
      },
      id,
    })
  }
  registerCommand({
    execute() {
      return toggleActiveChatViewSessionsList()
    },
    id: 'chat2.toggleSessionsList',
  })
  registerCommand({
    execute() {
      return getActiveChatQuickPickItems()
    },
    id: 'chat2.getQuickPickItems',
  })
  registerCommand({
    async execute(id: unknown) {
      await openActiveChatQuickPickItem(id)
    },
    id: 'chat2.openQuickPickItem',
  })
  try {
    const href = await executeCommand('Layout.getHref')
    const url = typeof href === 'string' ? getUrl(href) : undefined
    if (
      typeof href === 'string' &&
      url !== undefined &&
      isBoardPath(url.pathname)
    ) {
      await executeCommand('SideBar.show', boardViewId, true)
      await executeCommand('Layout.enterSideBarFocusMode', 'primary', true)
    } else if (
      typeof href === 'string' &&
      (parseChatTaskHash(href).type === 'task' ||
        (url !== undefined && isChatPath(url.pathname)))
    ) {
      await executeCommand('SideBar.show', viewId, true)
    }
  } catch {
    // The editor may not expose URL commands while the extension is activating.
  }
}

export const deactivate = (): void => {}
