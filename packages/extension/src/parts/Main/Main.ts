import {
  activate as activateExtensionApi,
  executeCommand,
  registerCommand,
  registerView,
} from '@lvce-editor/api'
import { view, viewId } from '../ChatView/ChatView.ts'
import {
  submitActiveChatViewInstance,
  toggleActiveChatViewFocusMode,
} from '../ChatView/CreateInstance.ts'

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
      const { headlessChatCommands } =
        await import('../HeadlessChat/HeadlessChat.ts')
      return headlessChatCommands.createSession(modelId)
    },
    id: 'chat2.createSession',
  })
  registerCommand({
    async execute(message: unknown, modelId?: unknown) {
      const { headlessChatCommands } =
        await import('../HeadlessChat/HeadlessChat.ts')
      return headlessChatCommands.runPrompt(message, modelId)
    },
    id: 'chat2.runPrompt',
  })
  registerCommand({
    async execute(message: unknown) {
      const { headlessChatCommands } =
        await import('../HeadlessChat/HeadlessChat.ts')
      return headlessChatCommands.sendMessage(message)
    },
    id: 'chat2.sendMessage',
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
  registerCommand({
    async execute() {
      await executeCommand('SideBar.show', viewId, true)
      await toggleActiveChatViewFocusMode()
    },
    id: 'chat2.toggleFocusMode',
  })
}

export const deactivate = (): void => {}
