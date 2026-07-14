import { strictEqual, throws } from 'node:assert'
import { test } from 'node:test'
import { parseScenario } from '../src/Scenario.ts'

const scenario = {
  checks: [{ path: 'index.html', type: 'fileExists' }],
  id: 'hello',
  model: 'test-model',
  prompt: 'Create a page.',
  timeoutMs: 10_000,
}

void test('allows temperature to be omitted', () => {
  strictEqual(parseScenario(scenario).temperature, undefined)
})

void test('validates a configured temperature', () => {
  strictEqual(parseScenario({ ...scenario, temperature: 0 }).temperature, 0)
  throws(() => parseScenario({ ...scenario, temperature: 3 }))
})
