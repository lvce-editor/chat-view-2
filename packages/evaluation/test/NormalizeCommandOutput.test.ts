import { deepStrictEqual, notDeepStrictEqual } from 'node:assert'
import { test } from 'node:test'
import { normalizeCommandOutput } from '../src/NormalizeCommandOutput.ts'

const body = (output: string): Readonly<Record<string, unknown>> => ({
  input: [{ call_id: 'command', output, type: 'function_call_output' }],
})

const getCommand = (id: string): string | undefined =>
  id === 'command' ? 'npm test' : undefined

void test('normalizes Node test timing while retaining assertions and non-command file data', () => {
  deepStrictEqual(
    normalizeCommandOutput(
      body('ok add\n  duration_ms: 1.26\n# pass 1'),
      getCommand,
    ),
    normalizeCommandOutput(
      body('ok add\n  duration_ms: 9.14\n# pass 1'),
      getCommand,
    ),
  )
  notDeepStrictEqual(
    normalizeCommandOutput(
      body('not ok add\n  duration_ms: 1.26\n# pass 0'),
      getCommand,
    ),
    normalizeCommandOutput(
      body('ok add\n  duration_ms: 1.26\n# pass 1'),
      getCommand,
    ),
  )
  deepStrictEqual(
    normalizeCommandOutput(body('duration_ms: 1.26'), () => undefined),
    body('duration_ms: 1.26'),
  )
})

void test('normalizes the desktop Node spec reporter timings', () => {
  deepStrictEqual(
    normalizeCommandOutput(
      body('✔ adds numbers (1.26ms)\nℹ pass 1\nℹ duration_ms 45.67\n'),
      getCommand,
    ),
    normalizeCommandOutput(
      body('✔ adds numbers (9.14ms)\nℹ pass 1\nℹ duration_ms 123.45\n'),
      getCommand,
    ),
  )
})
