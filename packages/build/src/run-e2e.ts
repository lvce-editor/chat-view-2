import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { loadEnvFile } from 'node:process'
import { startEvaluationProxy } from '../../evaluation/src/Proxy.ts'
import { root } from './root.ts'
import './build-extension.ts'

const record = process.argv.includes('--record')
const desktop =
  process.argv.includes('--electron') ||
  process.argv.includes('--runtime=electron')
const desktopWorkspace = desktop
  ? await mkdtemp(join(tmpdir(), 'chat-desktop-workspace-'))
  : undefined
if (record) {
  try {
    loadEnvFile(join(root, '.env'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
const proxy = await startEvaluationProxy({
  cacheDirectory: join(root, 'packages/evaluation/cache'),
  ...(desktop && { allowedOrigin: 'lvce://-' }),
  mode: record ? 'record' : 'replay',
  ...(record &&
    process.env.LVCE_ACCESS_TOKEN && { apiKey: process.env.LVCE_ACCESS_TOKEN }),
  model: 'gpt-5.4-mini',
  port: 8787,
  workspaceUri: desktopWorkspace
    ? pathToFileURL(desktopWorkspace).href
    : 'memfs:///recorded-workspace/',
  scenarioId: 'ui-e2e',
  enableControls: true,
  transcriptPath: join(root, 'packages/evaluation/results/ui-e2e.json'),
  upstreamBaseUrl:
    process.env.EVALUATION_UPSTREAM_URL || 'http://127.0.0.1:1/api/v1',
})
try {
  const cli = createRequire(join(root, 'packages/e2e/package.json')).resolve(
    '@lvce-editor/test-with-playwright/bin/test-with-playwright.js',
  )
  const forwardedArguments = process.argv
    .slice(2)
    .filter((arg) => arg !== '--record')
  const filterIndex = forwardedArguments.findIndex(
    (arg) => arg === '--filter' || arg.startsWith('--filter='),
  )
  const filterArgument = forwardedArguments[filterIndex]
  const filter =
    filterArgument === '--filter'
      ? forwardedArguments[filterIndex + 1]
      : filterArgument?.slice('--filter='.length)
  const desktopTests = desktop
    ? (await readdir(join(root, 'packages/desktop-tests/src')))
        .filter(
          (file) => file.endsWith('.ts') && (!filter || file.includes(filter)),
        )
        .sort()
    : [undefined]
  if (desktop && desktopTests.length === 0)
    throw new Error('No desktop tests matched the filter')
  if (desktop && filterIndex !== -1)
    forwardedArguments.splice(
      filterIndex,
      filterArgument === '--filter' ? 2 : 1,
    )
  // Each desktop scenario owns an app and private profile, including its exit.
  for (const desktopTest of desktopTests) {
    const child = spawn(
      process.execPath,
      [
        cli,
        ...(!desktop
          ? [`--only-extension=${join(root, 'packages/extension')}`]
          : []),
        `--test-path=${join(root, desktop ? 'packages/desktop-tests' : 'packages/e2e')}`,
        ...(desktop
          ? [
              `--electron-arg=--link=${join(root, 'packages/extension')}`,
              '--timeout=300000',
            ]
          : []),
        ...forwardedArguments,
        ...(desktopTest ? [`--filter=${desktopTest}`] : []),
      ],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          ...(desktopWorkspace && {
            CHAT_DESKTOP_WORKSPACE: desktopWorkspace,
            CHAT_DESKTOP_REPLAY_URL: proxy.origin,
          }),
        },
      },
    )
    process.exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => resolve(code ?? 1))
    })
    if (process.exitCode !== 0) break
  }
} finally {
  await proxy.close()
  if (desktopWorkspace) {
    await rm(desktopWorkspace, { recursive: true, force: true })
  }
}
