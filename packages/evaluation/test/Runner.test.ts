/* eslint-disable @typescript-eslint/prefer-readonly-parameter-types */
import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import type { EvaluationBrowser } from '../src/Browser.ts'
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

  const responseBody = toEventStream([
    { response: { id: 'response-1' }, type: 'response.completed' },
  ])
  let upstreamRequests = 0
  const upstream = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/event-stream')
    response.end(responseBody)
    upstreamRequests++
  })
  const listening = Promise.withResolvers<void>()
  upstream.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise
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
  let prepareCalls = 0
  const browser: EvaluationBrowser = {
    async prepare() {
      prepareCalls++
    },
    async run(options) {
      strictEqual(options.model, 'test-model')
      strictEqual(options.prompt, 'Create a hello world page.')
      const models = await fetch(`${options.backendOrigin}/v1/models`)
      strictEqual(models.status, 200)
      const response = await fetch(`${options.backendOrigin}/v1/responses`, {
        body: JSON.stringify({ input: [], model: options.model, stream: true }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      strictEqual(await response.text(), responseBody)
      await writeFile(
        join(options.workspace, 'index.html'),
        '<h1>Hello World</h1>\n',
      )
    },
  }
  const recorded = await runEvaluations({
    ...paths,
    apiKey: 'test-key',
    browser,
    upstreamBaseUrl,
  })
  deepStrictEqual(recorded, [
    { cacheHits: 0, recordedResponses: 1, scenarioId: 'hello' },
  ])
  strictEqual(upstreamRequests, 1)

  const replayed = await runEvaluations({ ...paths, browser, upstreamBaseUrl })
  deepStrictEqual(replayed, [
    { cacheHits: 1, recordedResponses: 0, scenarioId: 'hello' },
  ])
  strictEqual(upstreamRequests, 1)
  strictEqual(prepareCalls, 2)
  strictEqual(
    await readFile(
      join(paths.workspacesDirectory, 'hello', 'index.html'),
      'utf8',
    ),
    '<h1>Hello World</h1>\n',
  )
  const closed = Promise.withResolvers<void>()
  upstream.close((error) => (error ? closed.reject(error) : closed.resolve()))
  await closed.promise
})
