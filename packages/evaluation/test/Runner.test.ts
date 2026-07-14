/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { runEvaluations } from '../src/Runner.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((path) =>
      rm(path, { force: true, recursive: true }),
    ),
  )
  temporaryDirectories.length = 0
})

const toEventStream = (events: readonly unknown[]): string => {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
}

void test('runs scenarios, records misses, and replays matching requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chat-evaluation-runner-'))
  temporaryDirectories.push(root)
  const scenariosDirectory = join(root, 'scenarios')
  const scenarioDirectory = join(scenariosDirectory, 'hello')
  await mkdir(join(scenarioDirectory, 'fixture'), { recursive: true })
  await writeFile(
    join(scenarioDirectory, 'scenario.json'),
    `${JSON.stringify({
      checks: [
        { path: 'index.html', text: 'Hello World', type: 'fileContains' },
        {
          command:
            "node -e \"const fs = require('node:fs'); if (!fs.readFileSync('index.html', 'utf8').includes('Hello World')) process.exit(1)\"",
          type: 'command',
        },
      ],
      id: 'hello',
      model: 'test-model',
      prompt: 'Create a hello world page.',
      temperature: 0,
      timeoutMs: 10_000,
    })}\n`,
  )
  await writeFile(join(scenarioDirectory, 'fixture', '.gitkeep'), '')

  const responseBodies = [
    toEventStream([
      {
        item: {
          arguments: JSON.stringify({
            newText: '<h1>Hello World</h1>\n',
            oldText: '',
            path: 'index.html',
          }),
          call_id: 'call-1',
          name: 'apply_patch',
          type: 'function_call',
        },
        type: 'response.output_item.done',
      },
      { response: { id: 'response-1' }, type: 'response.completed' },
    ]),
    toEventStream([
      { response: { id: 'response-2' }, type: 'response.completed' },
    ]),
  ]
  let upstreamRequests = 0
  const upstream = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/event-stream')
    response.end(responseBodies[upstreamRequests] || responseBodies[1])
    upstreamRequests++
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test upstream did not bind')
  }
  const paths = {
    cacheDirectory: join(root, 'cache'),
    resultsDirectory: join(root, 'results'),
    scenariosDirectory,
    workspacesDirectory: join(root, 'workspaces'),
  }
  const upstreamBaseUrl = `http://127.0.0.1:${address.port}/v1`
  const recorded = await runEvaluations({
    ...paths,
    apiKey: 'test-key',
    upstreamBaseUrl,
  })
  deepStrictEqual(recorded, [
    { cacheHits: 0, recordedResponses: 2, scenarioId: 'hello' },
  ])
  strictEqual(upstreamRequests, 2)

  const replayed = await runEvaluations({ ...paths, upstreamBaseUrl })
  deepStrictEqual(replayed, [
    { cacheHits: 2, recordedResponses: 0, scenarioId: 'hello' },
  ])
  strictEqual(upstreamRequests, 2)
  strictEqual(
    await readFile(
      join(paths.workspacesDirectory, 'hello', 'index.html'),
      'utf8',
    ),
    '<h1>Hello World</h1>\n',
  )
  await new Promise<void>((resolve, reject) =>
    upstream.close((error) => (error ? reject(error) : resolve())),
  )
})
