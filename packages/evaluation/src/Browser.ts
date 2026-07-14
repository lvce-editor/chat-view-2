/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

export interface BrowserScenarioOptions {
  readonly backendOrigin: string
  readonly model: string
  readonly prompt: string
  readonly scenarioId: string
  readonly timeoutMs: number
  readonly workspace: string
}

export interface EvaluationBrowser {
  readonly prepare: () => Promise<void>
  readonly run: (options: BrowserScenarioOptions) => Promise<void>
}

interface RunProcessOptions {
  readonly args: readonly string[]
  readonly command: string
  readonly cwd: string
  readonly timeoutMs: number
}

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = join(packageRoot, '..', '..')
const e2eDirectory = join(repositoryRoot, 'packages', 'e2e')
const extensionDirectory = join(repositoryRoot, 'packages', 'extension')
const playwrightCli = join(
  e2eDirectory,
  'node_modules',
  '@lvce-editor',
  'test-with-playwright',
  'bin',
  'test-with-playwright.js',
)
const maximumProcessOutput = 128_000

const runProcess = async ({
  args,
  command,
  cwd,
  timeoutMs,
}: RunProcessOptions): Promise<void> => {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output: Buffer[] = []
  const appendOutput = (chunk: Buffer): void => {
    output.push(chunk)
  }
  child.stdout.on('data', appendOutput)
  child.stderr.on('data', appendOutput)
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, timeoutMs)
  let exitCode: number
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code ?? 1))
    })
  } finally {
    clearTimeout(timeout)
  }
  const text = Buffer.concat(output)
    .toString('utf8')
    .slice(-maximumProcessOutput)
  if (timedOut) {
    throw new Error(`Headless browser evaluation timed out\n${text}`)
  }
  if (exitCode !== 0) {
    throw new Error(
      `Headless browser evaluation exited with code ${exitCode}\n${text}`,
    )
  }
}

export const createBrowserTestSource = (
  options: BrowserScenarioOptions,
): string => {
  const configuration = JSON.stringify({
    backendOrigin: options.backendOrigin,
    model: options.model,
    prompt: options.prompt,
    scenarioId: options.scenarioId,
    workspace: pathToFileURL(options.workspace).href,
  })
  return `const configuration = ${configuration}

export const name = \`chat2.evaluation.\${configuration.scenarioId}\`

export const test = async ({ Command, Workspace }) => {
  // Let Playwright's network-idle navigation finish before starting a long request.
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await Workspace.setPath(configuration.workspace)
  await Command.execute('Preferences.update', {
    'chat2.backendUrl': configuration.backendOrigin,
    'chat2.selectedModelId': configuration.model,
    'chat2.supportsStreaming': true,
    'chat2.useMockBackend': false,
  })
  await Command.executeExtensionCommand(
    'chat2.createSession',
    configuration.model,
  )
  await Command.executeExtensionCommand(
    'chat2.sendMessage',
    configuration.prompt,
  )
}
`
}

export const createEvaluationBrowser = (): EvaluationBrowser => ({
  async prepare(): Promise<void> {
    await runProcess({
      args: [
        join(repositoryRoot, 'packages', 'build', 'src', 'build-extension.ts'),
      ],
      command: process.execPath,
      cwd: repositoryRoot,
      timeoutMs: 120_000,
    })
  },
  async run(options): Promise<void> {
    const testDirectory = await mkdtemp(
      join(tmpdir(), 'chat-view-2-evaluation-'),
    )
    try {
      const sourceDirectory = join(testDirectory, 'src')
      await mkdir(sourceDirectory)
      await writeFile(
        join(sourceDirectory, `${options.scenarioId}.js`),
        createBrowserTestSource(options),
      )
      await runProcess({
        args: [
          playwrightCli,
          `--only-extension=${extensionDirectory}`,
          `--test-path=${testDirectory}`,
          '--headless',
          `--timeout=${options.timeoutMs}`,
        ],
        command: process.execPath,
        cwd: e2eDirectory,
        timeoutMs: options.timeoutMs + 60_000,
      })
    } finally {
      await rm(testDirectory, { force: true, recursive: true })
    }
  },
})
