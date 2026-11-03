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

export const name = 'chat2.recorded.implementation'

export const test: Test = async (api) => {
  await prepareChat(api, {
    'package.json':
      JSON.stringify(
        {
          name: 'evaluation-fix-node-test',
          private: true,
          scripts: { test: 'node --test' },
          type: 'module',
          version: '1.0.0',
        },
        null,
        2,
      ) + '\n',
    'src/add.js': 'export const add = (left, right) => left - right\n',
    'test/add.test.js':
      "import assert from 'node:assert/strict'\nimport test from 'node:test'\nimport { add } from '../src/add.js'\n\ntest('adds two numbers', () => {\n  assert.equal(add(2, 3), 5)\n})\n",
  })
  await openChat(api)
  await startMessage(
    api,
    'Fix the obvious bug in this Node.js project so that npm test passes. Keep the change scoped to the bug.',
  )
  await waitForTasks(api)
  const content = await api.FileSystem.readFile(`${workspace}src/add.js`)
  if (!content.includes('left + right')) {
    throw new Error(`The real file was not fixed: ${content}`)
  }
  await api.expect(api.Locator('.ChatChanges')).toContainText('src/add.js')
  await api.expect(api.Locator('button[name="revert"]')).toHaveCount(0)
}
