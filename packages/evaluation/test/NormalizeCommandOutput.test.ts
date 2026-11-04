import { deepStrictEqual, notDeepStrictEqual } from 'node:assert'
import { test } from 'node:test'
import { normalizeCommandOutput } from '../src/NormalizeCommandOutput.ts'

const body = (output: string): Readonly<Record<string, unknown>> => ({
  input: [{ call_id: 'command', output, type: 'function_call_output' }],
})

const getCommand = (id: string): string | undefined =>
  id === 'command' ? 'npm test' : undefined

const command = (): string =>
  'cd /recorded-workspace && npm test -- --runInBand'

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

void test('normalizes the optional npm banner for the same Node test script', () => {
  const output = '✔ adds numbers (1.26ms)\nℹ pass 1\n'
  deepStrictEqual(
    normalizeCommandOutput(
      body(`\n> desktop-chat-fixture@1.0.0 test\n> node --test\n\n${output}`),
      getCommand,
    ),
    normalizeCommandOutput(body(output), getCommand),
  )
  notDeepStrictEqual(
    normalizeCommandOutput(
      body(
        `\n> desktop-chat-fixture@1.0.0 test\n> node different-script.js\n\n${output}`,
      ),
      getCommand,
    ),
    normalizeCommandOutput(body(output), getCommand),
  )
})

void test('normalizes a Node test command from the portable workspace and its forwarded npm arguments', () => {
  const output = 'node: bad option: --runInBand\n'
  deepStrictEqual(
    normalizeCommandOutput(
      body(
        `\n> desktop-chat-fixture@1.0.0 test\n> node --test --runInBand\n\n${output}`,
      ),
      command,
    ),
    normalizeCommandOutput(body(output), command),
  )
  deepStrictEqual(
    normalizeCommandOutput(
      body('✔ adds numbers (1.2ms)\nℹ pass 1'),
      () => 'cd /recorded-workspace && npm test',
    ),
    normalizeCommandOutput(
      body('✔ adds numbers (5.6ms)\nℹ pass 1'),
      () => 'cd /recorded-workspace && npm test',
    ),
  )
  notDeepStrictEqual(
    normalizeCommandOutput(
      body('✔ adds numbers (1.2ms)\nℹ pass 0'),
      () => 'cd /recorded-workspace && npm test',
    ),
    normalizeCommandOutput(
      body('✔ adds numbers (5.6ms)\nℹ pass 1'),
      () => 'cd /recorded-workspace && npm test',
    ),
  )
})

void test('retains command exit codes when normalizing npm banners', () => {
  deepStrictEqual(
    normalizeCommandOutput(
      body(
        'Command exited with code 9\n\n> desktop-chat-fixture@1.0.0 test\n> node --test --runInBand\n\nnode: bad option: --runInBand\n',
      ),
      command,
    ),
    body('Command exited with code 9\nnode: bad option: --runInBand\n'),
  )
})
