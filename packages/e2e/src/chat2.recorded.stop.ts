import type { Test, TestApi } from '@lvce-editor/test-with-playwright'

const workspace = 'memfs:///recorded-workspace/'

const replayUrl = 'http://127.0.0.1:8787'

const openChat = async (api: TestApi): Promise<void> => {
  await api.QuickPick.open()
  await api.QuickPick.setValue('>toggle ai')
  await api.QuickPick.selectItem('View: Toggle AI-Native / IDE Layout')
  await api.expect(api.Locator('.Workbench.AiNativeLayout')).toHaveCount(1)
}

const prepareChat = async (
  api: TestApi,
  files: Readonly<Record<string, string>> = {},
): Promise<void> => {
  await api.Main.closeAllEditors()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('lvce-chat-2')
    request.onsuccess = (): void => resolve()
    request.onerror = (): void =>
      reject(request.error || new Error('Unable to clear chat test state'))
    request.onblocked = (): void =>
      reject(new Error('Previous test retained the chat database'))
  })
  if (files) {
    try {
      await api.FileSystem.remove(workspace)
    } catch {
      /* The test workspace may not exist yet. */
    }
    await api.FileSystem.mkdir(workspace)
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/')
      if (parts.length > 1) {
        await api.FileSystem.mkdir(
          `${workspace}${parts.slice(0, -1).join('/')}`,
        )
      }
      await api.FileSystem.writeFile(`${workspace}${path}`, content)
    }
    await api.Workspace.setPath(workspace)
  }
  await api.Command.execute('Preferences.update', {
    'chat2.backendUrl': replayUrl,
    'chat2.computerUseEnabled': false,
    'chat2.selectedModelId': 'gpt-5.4-mini',
    'chat2.supportsStreaming': true,
    'chat2.useMockBackend': false,
  })
}

const controlReplay = async (
  api: TestApi,
  action: 'pause' | 'resume',
): Promise<void> => {
  // The test worker has no external fetch capability. Use a catalog-only
  // session to control the local replay server without generating a response.
  await api.Command.execute('Preferences.update', {
    'chat2.backendUrl': `${replayUrl}/__replay/${action}`,
    'chat2.computerUseEnabled': false,
  })
  try {
    await api.Command.executeExtensionCommand(
      'chat2.createSession',
      'gpt-5.4-mini',
    )
  } finally {
    await api.Command.execute('Preferences.update', {
      'chat2.backendUrl': replayUrl,
      'chat2.computerUseEnabled': false,
    })
  }
}

const startMessage = async (
  api: TestApi,
  message: string,
  userIndex = 0,
): Promise<void> => {
  await api.Locator('textarea[name="composer"]').type(message)
  await api
    .expect(api.Locator('button[name="submit"]'))
    .toHaveAttribute('disabled', null)
  await api.KeyBoard.press('Enter')
  await api
    .expect(api.Locator('.ChatMessageUser').nth(userIndex))
    .toContainText(message)
}

const waitForTasks = async (api: TestApi, count = 1): Promise<void> => {
  const deadline = Date.now() + 120_000
  while (true) {
    try {
      await api
        .expect(
          api.Locator('.ChatTaskStatus-completed, .ChatTaskStatus-failed'),
        )
        .toHaveCount(count)
      break
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error
      }
    }
  }
  await api
    .expect(api.Locator('.ChatTaskStatus-running, .ChatTaskStatus-stopping'))
    .toHaveCount(0)
  await api.expect(api.Locator('.ChatTaskStatus-failed')).toHaveCount(0)
  await api.expect(api.Locator('.ChatError, .ChatErrorBanner')).toHaveCount(0)
}

export const name = 'chat2.recorded.stop'

export const test: Test = async (api) => {
  await prepareChat(api)
  await openChat(api)
  await controlReplay(api, 'pause')
  try {
    await startMessage(
      api,
      'What is the weather forecast for Berlin, Germany on November 4, 2026? Use web search and cite your sources.',
    )
    await api.expect(api.Locator('.ChatTaskStatus-running')).toHaveCount(1)
    // eslint-disable-next-line e2e/no-direct-click
    await api.Locator('button[name="stop"]').click()
    await api.expect(api.Locator('.ChatTaskStatus-stopped')).toHaveCount(1)
    await api.expect(api.Locator('.ChatTaskStatus-running')).toHaveCount(0)
  } finally {
    await controlReplay(api, 'resume')
  }
  // eslint-disable-next-line e2e/no-direct-click
  await api.Locator('.ChatSessions .ChatNewTaskButton').click()
  await startMessage(
    api,
    'What is the weather forecast for Berlin, Germany on November 4, 2026? Use web search and cite your sources.',
  )
  await waitForTasks(api)
  await api.expect(api.Locator('.ChatTaskStatus-stopped')).toHaveCount(1)
  await api.expect(api.Locator('.ChatMessageAssistant')).toContainText('Berlin')
}
