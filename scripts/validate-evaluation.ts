import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseScenario } from '../packages/evaluation/src/Scenario.ts'

const scenariosDirectory = new URL(
  '../packages/evaluation/scenarios/',
  import.meta.url,
)
const scenariosPath = fileURLToPath(scenariosDirectory)
const entries = (await readdir(scenariosDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name))

if (entries.length < 2) {
  throw new Error(
    `Expected at least 2 evaluation scenarios, received ${entries.length}`,
  )
}
const ids = new Set<string>()
for (const entry of entries) {
  const scenarioDirectory = join(scenariosPath, entry.name)
  const scenario = parseScenario(
    JSON.parse(
      await readFile(join(scenarioDirectory, 'scenario.json'), 'utf8'),
    ),
  )
  if (scenario.id !== entry.name) {
    throw new Error(
      `Scenario folder ${entry.name} contains scenario id ${scenario.id}`,
    )
  }
  if (ids.has(scenario.id)) {
    throw new Error(`Duplicate evaluation scenario id: ${scenario.id}`)
  }
  ids.add(scenario.id)
  if (!(await stat(join(scenarioDirectory, 'fixture'))).isDirectory()) {
    throw new Error(`Scenario ${scenario.id} has no fixture directory`)
  }
}
console.log(`Validated ${entries.length} Chat 2 evaluation scenarios`)
