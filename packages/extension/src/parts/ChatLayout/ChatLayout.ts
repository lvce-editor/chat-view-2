import { executeCommand } from '@lvce-editor/api'
import {
  setWorkbenchLayoutUrl,
  toggleActiveChatViewFocusMode,
} from '../ChatView/CreateInstance.ts'

type ChatLayout = 'ide' | 'ai-native'

interface ChatLayoutHost {
  readonly executeCommand: (
    id: string,
    ...args: readonly unknown[]
  ) => Promise<unknown>
  readonly setWorkbenchLayoutUrl: typeof setWorkbenchLayoutUrl
  readonly toggleFocusMode: () => Promise<void>
}

const defaultHost: ChatLayoutHost = {
  executeCommand,
  setWorkbenchLayoutUrl,
  toggleFocusMode: toggleActiveChatViewFocusMode,
}

export const showChatLayout = async (
  layout: ChatLayout,
  host: ChatLayoutHost = defaultHost,
): Promise<void> => {
  await host.setWorkbenchLayoutUrl(host.executeCommand, layout)
  if (
    layout === 'ide' &&
    (await host.executeCommand('Layout.getSideBarFocusMode')) &&
    (await host.executeCommand('Layout.getActiveSideBarView')) ===
      'chat2.views.board'
  ) {
    await host.executeCommand('SideBar.show', 'Explorer', true)
    await host.executeCommand('Layout.leaveSideBarFocusMode')
    return
  }
  // Keep the previous layout intact until the new view has finished loading.
  await host.executeCommand('SideBar.show', 'chat2.views.chat', true)
  const focusMode = await host.executeCommand('Layout.getSideBarFocusMode')
  if (Boolean(focusMode) !== (layout === 'ai-native')) {
    await host.toggleFocusMode()
  }
  if (layout === 'ide') {
    await host.executeCommand('Layout.leaveSideBarFocusMode')
  }
}
