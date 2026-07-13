import {
  activate as activateExtensionApi,
  executeCommand,
  registerCommand,
  registerView,
} from '@lvce-editor/api'
import { view, viewId } from '../ChatView/ChatView.ts'

let activated = false

export const activate = async (): Promise<void> => {
  if (activated) {
    return
  }
  activated = true
  await activateExtensionApi()
  registerView(view)
  registerCommand({
    execute() {
      return executeCommand('SideBar.show', viewId, true)
    },
    id: 'chat2.show',
  })
}

export const deactivate = (): void => {}
