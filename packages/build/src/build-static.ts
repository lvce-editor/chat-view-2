import { createHash } from 'node:crypto'
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createBrotliDecompress } from 'node:zlib'
import tar from 'tar-fs'
import './build.ts'
import { root } from './root.ts'

const extensionId = 'builtin.chat-view-2'
const serverPackagePath = join(root, 'packages', 'server', 'package.json')
const serverRequire = createRequire(serverPackagePath)
const { exportStatic } = serverRequire('@lvce-editor/shared-process')

const boardExtensionUrl =
  'https://github.com/lvce-editor/board-view-worker/releases/download/v0.1.0/board-view-worker-v0.1.0.tar.br'
const boardExtensionSha256 =
  'be96e68247abbb14040e68f5c73975c3a2e2ce20f6bc2527b9d3bc690e4b8e2f'

const assertFileExists = async (file: string): Promise<void> => {
  try {
    await access(file)
  } catch {
    throw new Error(`Expected static build file to exist: ${file}`)
  }
}

const readJson = async <T>(file: string): Promise<T> => {
  const content = await readFile(file, 'utf8')
  return JSON.parse(content) as T
}

const assertChatExtensionEntry = (
  entries: readonly Record<string, unknown>[],
  file: string,
): Record<string, unknown> => {
  const entry = entries.find((entry) => entry.id === extensionId)
  if (!entry) {
    throw new Error(`Expected ${file} to include ${extensionId}`)
  }
  return entry
}

const assertStaticChatExtension = async (commitHash: string): Promise<void> => {
  const commitDir = path.join(root, 'dist', commitHash)
  const extensionDir = path.join(commitDir, 'extensions', extensionId)
  const extensionJsonPath = path.join(extensionDir, 'extension.json')
  const extensionsJsonPath = path.join(commitDir, 'config', 'extensions.json')
  const webExtensionsJsonPath = path.join(
    commitDir,
    'config',
    'webExtensions.json',
  )

  await assertFileExists(extensionJsonPath)

  const extensionJson =
    await readJson<Record<string, unknown>>(extensionJsonPath)
  if (typeof extensionJson.browser !== 'string' || !extensionJson.browser) {
    throw new Error(`Expected ${extensionJsonPath} to define a browser entry`)
  }
  await assertFileExists(path.join(extensionDir, extensionJson.browser))

  const extensionsJson =
    await readJson<readonly Record<string, unknown>[]>(extensionsJsonPath)
  const extensionEntry = assertChatExtensionEntry(
    extensionsJson,
    extensionsJsonPath,
  )
  const expectedPathSuffix = `/${commitHash}/extensions/${extensionId}`
  if (
    typeof extensionEntry.path !== 'string' ||
    !extensionEntry.path.endsWith(expectedPathSuffix)
  ) {
    throw new Error(
      `Expected ${extensionsJsonPath} path for ${extensionId} to end with ${expectedPathSuffix}, got ${extensionEntry.path}`,
    )
  }

  const webExtensionsJson = await readJson<readonly Record<string, unknown>[]>(
    webExtensionsJsonPath,
  )
  assertChatExtensionEntry(webExtensionsJson, webExtensionsJsonPath)

  const workerPath = path.join(
    commitDir,
    'packages',
    'extension-management-worker',
    'dist',
    'extensionManagementWorkerMain.js',
  )
  const worker = await readFile(workerPath, 'utf8')
  const requiredRuntimeContext = [
    `return typeof assetDir !== 'string' || assetDir.length === 0;`,
    `const getRuntimeContext = async (assetDir, platform, applicationId) => {`,
    `isHttpLocation() && isStaticHttpAssetDir(resolvedAssetDir)`,
    `platform: Web`,
  ]
  if (requiredRuntimeContext.some((snippet) => !worker.includes(snippet))) {
    throw new Error(
      `Expected ${workerPath} to include static web runtime context resolution`,
    )
  }
}

await cp(path.join(root, 'dist'), path.join(root, 'dist2'), {
  recursive: true,
  force: true,
})

process.env.PATH_PREFIX ??= 'auto'

const exportChatAndBoard = async (): Promise<{ commitHash: string }> => {
  const boardExtensionPath = await mkdtemp(join(tmpdir(), 'chat2-board-view-'))
  try {
    const response = await fetch(boardExtensionUrl)
    if (!response.ok) {
      throw new Error(`Board extension download failed: ${response.status}`)
    }
    const archive = Buffer.from(await response.arrayBuffer())
    if (
      createHash('sha256').update(archive).digest('hex') !==
      boardExtensionSha256
    ) {
      throw new Error('Board extension archive SHA-256 mismatch')
    }
    await pipeline(
      Readable.from(archive),
      createBrotliDecompress(),
      tar.extract(boardExtensionPath),
    )
    return await exportStatic({
      extensionPath: 'packages/extension',
      extensionPaths: [boardExtensionPath],
      testPath: 'packages/e2e',
      root,
    })
  } finally {
    await rm(boardExtensionPath, { recursive: true, force: true })
  }
}
const { commitHash } = await exportChatAndBoard()

await cp(
  path.join(root, 'dist2'),
  path.join(root, 'dist', commitHash, 'extensions', extensionId),
  { recursive: true, force: true },
)

const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8')
// Select the board before view activation; the host otherwise restores Explorer.
const configPattern =
  /(<script id="Config" type="application\/json">)([\s\S]*?)(<\/script>)/
const configMatch = configPattern.exec(html)
if (!configMatch) {
  throw new Error('Expected static HTML to contain the runtime Config script')
}
const config = JSON.parse(configMatch[2])
config.initialLayout = {
  ...config.initialLayout,
  sideBarView: 'chat2.views.board',
  sideBarVisible: true,
}
const boardHtml = html.replace(
  configPattern,
  (_, start: string, _content: string, end: string) =>
    `${start}\n${JSON.stringify(config, null, 2)}\n${end}`,
)
for (const route of ['boards', 'board']) {
  const boardPath = path.join(root, 'dist', route)
  await mkdir(boardPath, { recursive: true })
  await writeFile(path.join(boardPath, 'index.html'), boardHtml)
}

await assertStaticChatExtension(commitHash)
