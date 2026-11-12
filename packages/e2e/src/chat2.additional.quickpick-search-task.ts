import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const workspace = 'memfs:///chat-quickpick-workspace/'

const prepare = async (api: TestApi): Promise<void> => {
  await api.Main.closeAllEditors()
  await api.Command.execute('Preferences.update', {
    'chat2.selectedModelId': 'gpt-5.4',
    'chat2.useMockBackend': true,
  })
  await api.FileSystem.mkdir(workspace)
  await api.FileSystem.writeFile(
    `${workspace}README.md`,
    'quickpick file search',
  )
  await api.Workspace.setPath(workspace)
  await api.ChatView2.show()
}

export const name = 'chat2.additional.quickpick-search-task'
export const test: Test = async (api) => {
  await prepare(api)
  await api.Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await api.expect(api.Locator('.Workbench.AiNativeLayout')).toBeVisible()

  await api.Command.execute('QuickPick.showEverything')
  await api.QuickPick.setValue('Add worker memory usage')
  await api
    .expect(api.Locator('.QuickPickItem').first())
    .toHaveText('Add worker memory usage')
  await api.QuickPick.selectItem('Add worker memory usage')
  await api
    .expect(api.Locator('.ChatDetailTitle'))
    .toHaveText('Add worker memory usage')

  await api.Command.executeExtensionCommand('chat2.toggleAiNativeLayout')
  await api.expect(api.Locator('.Workbench.AiNativeLayout')).toHaveCount(0)
  await api.Command.execute('QuickPick.showEverything')
  await api.QuickPick.setValue('README.md')
  await api
    .expect(api.Locator('.QuickPickItem').first())
    .toContainText('README.md')
}
