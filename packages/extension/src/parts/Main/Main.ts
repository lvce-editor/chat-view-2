import {
  activate as activateExtensionApi,
  executeCommand,
  registerCommand,
  registerView,
} from '@lvce-editor/api'
import { parseChatTaskHash } from '../ChatSessionUrl/ChatSessionUrl.ts'
import { view, viewId } from '../ChatView/ChatView.ts'
import {
  newChatInActiveChatViewInstance,
  submitActiveChatViewInstance,
  toggleActiveChatViewFocusMode,
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
        if (!(await executeCommand('Layout.getSideBarFocusMode'))) {
          await executeCommand('SideBar.show', viewId, true)
        }
        await toggleActiveChatViewFocusMode()
      },
      id,
    })
  }
  try {
    const href = await executeCommand('Layout.getHref')
    if (typeof href === 'string' && parseChatTaskHash(href).type === 'task') {
      await executeCommand('SideBar.show', viewId, true)
    }
  } catch {
    // The editor may not expose URL commands while the extension is activating.
  }
}

export const deactivate = (): void => {}
