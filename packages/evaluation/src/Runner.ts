/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { spawn } from 'node:child_process'
import { access, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  EvaluationScenario,
  EvaluationTranscript,
  ScenarioCheck,
} from './Types.ts'
import { createEvaluationBrowser, type EvaluationBrowser } from './Browser.ts'
import { startEvaluationProxy } from './Proxy.ts'
import { loadScenario, prepareScenarioWorkspace } from './Scenario.ts'

export interface EvaluationPaths {
  readonly cacheDirectory: string
  readonly resultsDirectory: string
  readonly scenariosDirectory: string
  readonly workspacesDirectory: string
}

export interface RunEvaluationsOptions extends EvaluationPaths {
  readonly apiKey?: string
  readonly browser?: EvaluationBrowser
  readonly log?: (message: string) => void
  readonly upstreamBaseUrl: string
}

export interface EvaluationRunResult {
  readonly cacheHits: number
  readonly recordedResponses: number
  readonly scenarioId: string
}

const getScenarioIds = async (
  directory: string,
): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))
}

const windowsDriveRegex = /^[a-zA-Z]:/

const validateCheckPath = (path: string): string => {
  const normalized = path.replaceAll('\\', '/')
  const segments = normalized.split('/').filter(Boolean)
  if (
    !normalized ||
    normalized.startsWith('/') ||
    windowsDriveRegex.test(normalized) ||
    normalized.includes('://') ||
    segments.includes('..')
  ) {
    throw new Error(`Check path must stay inside the workspace: ${path}`)
  }
  return segments.join('/')
}

const runCommand = async (
  command: string,
  workspace: string,
  timeoutMs: number,
): Promise<string> => {
  const child = spawn(command, {
    cwd: workspace,
    env: process.env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => {
    output.push(chunk)
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output.push(chunk)
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, timeoutMs)
  let exitCode: number
  try {
    const { promise, reject, resolve } = Promise.withResolvers<number>()
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
    exitCode = await promise
  } finally {
    clearTimeout(timeout)
  }
  const text = Buffer.concat(output).toString('utf8').slice(0, 128_000)
  if (timedOut) {
    throw new Error(`Check timed out: ${command}\n${text}`)
  }
  if (exitCode !== 0) {
    throw new Error(`Check failed (${exitCode}): ${command}\n${text}`)
  }
  return text
}

const runCheck = async (
  check: ScenarioCheck,
  scenario: EvaluationScenario,
  workspace: string,
): Promise<void> => {
  if (check.type === 'command') {
    await runCommand(check.command, workspace, scenario.timeoutMs)
    return
  }
  const path = join(workspace, validateCheckPath(check.path))
  if (check.type === 'fileExists') {
    try {
      await access(path)
    } catch {
      throw new Error(`Expected file to exist: ${check.path}`)
    }
    return
  }
  let content: string
  try {
    content = await readFile(path, 'utf8')
  } catch {
    throw new Error(`Expected file to contain text: ${check.path}`)
  }
  if (!content.includes(check.text)) {
    throw new Error(
      `Expected ${check.path} to contain ${JSON.stringify(check.text)}`,
    )
  }
}

const getResult = async (
  transcriptPath: string,
  scenarioId: string,
): Promise<EvaluationRunResult> => {
  const transcript = JSON.parse(
    await readFile(transcriptPath, 'utf8'),
  ) as EvaluationTranscript
  return {
    cacheHits: transcript.exchanges.filter(({ source }) => source === 'cache')
      .length,
    recordedResponses: transcript.exchanges.filter(
      ({ source }) => source === 'upstream',
    ).length,
    scenarioId,
  }
}

const runScenario = async (
  scenarioId: string,
  options: RunEvaluationsOptions,
): Promise<EvaluationRunResult> => {
  const scenario = await loadScenario(options.scenariosDirectory, scenarioId)
  await rm(join(options.workspacesDirectory, scenarioId), {
    force: true,
    recursive: true,
  })
  const workspace = await prepareScenarioWorkspace(
    options.scenariosDirectory,
    options.workspacesDirectory,
    scenarioId,
  )
  const transcriptPath = join(options.resultsDirectory, `${scenarioId}.json`)
  await rm(transcriptPath, { force: true })
  if (!options.browser) {
    throw new Error('Evaluation browser was not prepared')
  }
  const proxy = await startEvaluationProxy({
    ...(options.apiKey && { apiKey: options.apiKey }),
    cacheDirectory: options.cacheDirectory,
    model: scenario.model,
    port: 0,
    scenarioId,
    ...(scenario.temperature !== undefined && {
      temperature: scenario.temperature,
    }),
    transcriptPath,
    upstreamBaseUrl: options.upstreamBaseUrl,
  })
  const signal = AbortSignal.timeout(scenario.timeoutMs)
  try {
    await options.browser.run({
      backendOrigin: proxy.origin,
      model: scenario.model,
      prompt: scenario.prompt,
      scenarioId,
      timeoutMs: scenario.timeoutMs,
      workspace,
    })
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `Scenario ${scenarioId} timed out after ${scenario.timeoutMs}ms`,
      )
    }
    throw error
  } finally {
    await proxy.close()
  }
  for (const check of scenario.checks) {
    await runCheck(check, scenario, workspace)
  }
  return getResult(transcriptPath, scenarioId)
}

const formatSources = (result: EvaluationRunResult): string => {
  const sources: string[] = []
  if (result.cacheHits > 0) {
    sources.push(`${result.cacheHits} cached`)
  }
  if (result.recordedResponses > 0) {
    sources.push(`${result.recordedResponses} recorded`)
  }
  return sources.join(', ') || 'no model responses'
}

export const runEvaluations = async (
  options: RunEvaluationsOptions,
): Promise<readonly EvaluationRunResult[]> => {
  const scenarioIds = await getScenarioIds(options.scenariosDirectory)
  if (scenarioIds.length === 0) {
    throw new Error('No evaluation scenarios found')
  }
  const log = options.log || ((_message: string): void => {})
  const browser = options.browser || createEvaluationBrowser()
  await browser.prepare()
  const runOptions = { ...options, browser }
  log(`Running ${scenarioIds.length} evaluation scenarios`)
  const results: EvaluationRunResult[] = []
  for (const scenarioId of scenarioIds) {
    log(`- ${scenarioId}`)
    const result = await runScenario(scenarioId, runOptions)
    results.push(result)
    log(`  passed (${formatSources(result)})`)
  }
  log(`All ${results.length} evaluation scenarios passed`)
  return results
}
