import { dirname, join } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { startEvaluationProxy } from './Proxy.ts'
import { loadScenario, prepareScenarioWorkspace } from './Scenario.ts'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = join(packageRoot, '..', '..')
const scenariosDirectory = join(packageRoot, 'scenarios')

try {
  loadEnvFile(join(repositoryRoot, '.env'))
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error
  }
}

const [command, scenarioId] = process.argv.slice(2)
if (!scenarioId || (command !== 'prepare' && command !== 'proxy')) {
  throw new Error(
    'Usage: npm run evaluation:prepare -- <scenario> or npm run evaluation:proxy -- <scenario>',
  )
}

if (command === 'prepare') {
  const workspace = await prepareScenarioWorkspace(
    scenariosDirectory,
    join(packageRoot, 'workspaces'),
    scenarioId,
  )
  process.stdout.write(`${workspace}\n`)
} else {
  const scenario = await loadScenario(scenariosDirectory, scenarioId)
  const port = Number(process.env.EVALUATION_PORT || '8787')
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid EVALUATION_PORT: ${process.env.EVALUATION_PORT}`)
  }
  const proxy = await startEvaluationProxy({
    ...(process.env.EVALUATION_ALLOWED_ORIGIN && {
      allowedOrigin: process.env.EVALUATION_ALLOWED_ORIGIN,
    }),
    ...(process.env.OPENAI_API_KEY && {
      apiKey: process.env.OPENAI_API_KEY,
    }),
    cacheDirectory: join(packageRoot, 'cache'),
    model: scenario.model,
    port,
    scenarioId,
    temperature: scenario.temperature,
    transcriptPath: join(packageRoot, 'results', `${scenario.id}.json`),
    upstreamBaseUrl:
      process.env.EVALUATION_UPSTREAM_URL || 'https://api.openai.com/v1',
  })
  process.stdout.write(`Evaluation proxy: ${proxy.origin}\n`)
  process.stdout.write(`Set chat2.backendUrl to ${proxy.origin}\n`)
  process.stdout.write(`Prompt: ${scenario.prompt}\n`)

  const close = async (): Promise<void> => {
    await proxy.close()
    process.exitCode = 0
  }
  process.once('SIGINT', () => void close())
  process.once('SIGTERM', () => void close())
}
