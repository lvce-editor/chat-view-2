import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { EvaluationScenario, ScenarioCheck } from './Types.ts'

const isCheck = (value: unknown): value is ScenarioCheck => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const check = value as Readonly<Record<string, unknown>>
  if (check.type === 'command') {
    return typeof check.command === 'string' && check.command.length > 0
  }
  if (check.type === 'fileExists') {
    return typeof check.path === 'string' && check.path.length > 0
  }
  return (
    check.type === 'fileContains' &&
    typeof check.path === 'string' &&
    check.path.length > 0 &&
    typeof check.text === 'string' &&
    check.text.length > 0
  )
}

const isTemperature = (value: unknown): value is number | undefined => {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 2)
  )
}

export const parseScenario = (value: unknown): EvaluationScenario => {
  if (!value || typeof value !== 'object') {
    throw new Error('Scenario must be a JSON object')
  }
  const scenario = value as Readonly<Record<string, unknown>>
  if (
    typeof scenario.id !== 'string' ||
    !scenario.id ||
    typeof scenario.model !== 'string' ||
    !scenario.model ||
    typeof scenario.prompt !== 'string' ||
    !scenario.prompt ||
    !isTemperature(scenario.temperature) ||
    typeof scenario.timeoutMs !== 'number' ||
    !Number.isSafeInteger(scenario.timeoutMs) ||
    scenario.timeoutMs <= 0 ||
    !Array.isArray(scenario.checks) ||
    scenario.checks.length === 0 ||
    !scenario.checks.every(isCheck)
  ) {
    throw new Error(`Invalid evaluation scenario: ${JSON.stringify(value)}`)
  }
  return scenario as unknown as EvaluationScenario
}

export const loadScenario = async (
  scenariosDirectory: string,
  scenarioId: string,
): Promise<EvaluationScenario> => {
  const path = join(scenariosDirectory, scenarioId, 'scenario.json')
  const scenario = parseScenario(JSON.parse(await readFile(path, 'utf8')))
  if (scenario.id !== scenarioId) {
    throw new Error(
      `Scenario folder ${scenarioId} contains scenario id ${scenario.id}`,
    )
  }
  return scenario
}

export const prepareScenarioWorkspace = async (
  scenariosDirectory: string,
  workspacesDirectory: string,
  scenarioId: string,
): Promise<string> => {
  await loadScenario(scenariosDirectory, scenarioId)
  const source = join(scenariosDirectory, scenarioId, 'fixture')
  const destination = join(workspacesDirectory, scenarioId)
  await mkdir(workspacesDirectory, { recursive: true })
  await cp(source, destination, {
    errorOnExist: true,
    force: false,
    recursive: true,
  })
  await rm(join(destination, '.gitkeep'), { force: true })
  return destination
}
