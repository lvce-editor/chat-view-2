import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../../dist/', import.meta.url))
const prefix = '/chat-view-2/'
const mimeTypes: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
}
const server = createServer((request, response) => {
  void serve(request, response)
})

async function serve(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = request.url || '/'
    assert.ok(URL.canParse(url, 'http://localhost'))
    const pathname = decodeURIComponent(
      new URL(url, 'http://localhost').pathname,
    )
    assert.ok(pathname.startsWith(prefix))
    const file = resolve(root, pathname.slice(prefix.length))
    assert.ok(file.startsWith(root.endsWith(sep) ? root : root + sep))
    const content = await readFile(file)
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream',
    })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end()
  }
}

await new Promise<void>((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
try {
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl =
    process.env.STATIC_TEST_BASE_URL ||
    `http://127.0.0.1:${address.port}${prefix}`
  assert.ok(URL.canParse(baseUrl))
  const origin = new URL(baseUrl).origin
  const browser = await chromium.launch({ headless: true })
  try {
    const files = await readdir(join(root, 'tests'))
    const tests = files
      .filter(
        (file) =>
          file.endsWith('.html') &&
          file !== '_all.html' &&
          file !== 'index.html',
      )
      .toSorted((a, b) => a.localeCompare(b))
    assert.ok(tests.length > 0, 'No exported tests found')
    const index = await browser.newPage()
    try {
      const response = await index.goto(`${baseUrl}tests/index.html`)
      assert.equal(response?.status(), 200)
      for (const test of tests) {
        assert.equal(await index.locator(`a[href="./${test}"]`).count(), 1)
      }
    } finally {
      await index.close()
    }
    const failures: string[] = []
    for (const test of tests) {
      const context = await browser.newContext()
      const externalRequests: string[] = []
      // Exported tests must use the deterministic backend without credentials.
      await context.route('**/*', async (route) => {
        const url = route.request().url()
        if (new URL(url).origin !== origin) {
          externalRequests.push(url)
          await route.abort()
          return
        }
        await route.continue()
      })
      try {
        const page = await context.newPage()
        await page.goto(`${baseUrl}tests/${test}`)
        const overlay = page.locator('#TestOverlay')
        await overlay.waitFor({ timeout: 60_000 })
        const state = await overlay.getAttribute('data-state')
        const text = await overlay.textContent()
        assert.notEqual(state, 'fail', text || test)
        assert.ok(
          ['pass', 'skip'].includes(state || ''),
          `Unknown result: ${state}`,
        )
        assert.deepEqual(externalRequests, [], 'Unexpected external requests')
        process.stdout.write(`${test}: ${state}\n`)
      } catch (error) {
        failures.push(`${test}: ${String(error)}`)
        console.error(failures.at(-1))
      } finally {
        await context.close()
      }
    }
    assert.deepEqual(failures, [], 'Exported e2e tests failed')
  } finally {
    await browser.close()
  }
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
