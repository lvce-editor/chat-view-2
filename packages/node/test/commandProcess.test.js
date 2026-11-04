import {
  NodeForkedProcessRpcParent,
  WebSocketRpcParent,
} from '@lvce-editor/rpc'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

test(
  'runs a command in its bound workspace through the packaged Node process',
  { timeout: 20_000 },
  async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'chat-command-'))
    await writeFile(join(workspace, 'marker.txt'), 'bound workspace')
    const server = createServer()
    const sockets = new Set()
    let controlRpc
    let rpc
    try {
      const processPath = fileURLToPath(
        new URL('../../../dist/dist/commandProcessMain.js', import.meta.url),
      )
      const childRpc = await NodeForkedProcessRpcParent.create({
        commandMap: {},
        path: processPath,
      })
      controlRpc = childRpc
      const { promise: attached, reject, resolve } = Promise.withResolvers()
      server.on('upgrade', (request, socket) => {
        sockets.add(socket)
        socket.once('close', () => sockets.delete(socket))
        socket.pause()
        const serializableRequest = {
          headers: request.headers,
          method: request.method,
          url: request.url,
        }
        const attach = async () => {
          try {
            await childRpc.invokeAndTransfer(
              'NodeRpcProcess.handleWebSocket',
              socket,
              serializableRequest,
            )
            resolve()
          } catch (error) {
            reject(error)
          }
        }
        void attach()
      })
      const listening = Promise.withResolvers()
      try {
        server.once('error', listening.reject)
        server.listen(0, '127.0.0.1', listening.resolve)
      } catch (error) {
        listening.reject(error)
      }
      await listening.promise
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      const webSocket = new WebSocket(`ws://127.0.0.1:${address.port}`)
      rpc = await WebSocketRpcParent.create({ commandMap: {}, webSocket })
      await attached

      const result = await rpc.invoke(
        'ChatCommand.execute',
        'run-1',
        pathToFileURL(workspace).href,
        `node -p "require('node:fs').existsSync('marker.txt')"`,
        { outputLimit: 1024, timeoutMs: 5000 },
      )
      assert.equal(result.exitCode, 0)
      assert.equal(result.output.trim(), 'true')
      const running = rpc.invoke(
        'ChatCommand.execute',
        'cancel-test',
        pathToFileURL(workspace).href,
        `node -e "require('node:fs').writeFileSync('running.txt','ready')"; while true; do :; done`,
        { outputLimit: 1024, timeoutMs: 10_000 },
      )
      const deadline = Date.now() + 5000
      while (true) {
        try {
          await readFile(join(workspace, 'running.txt'))
          break
        } catch {
          assert.ok(Date.now() < deadline, 'The packaged command did not start')
          await delay(20)
        }
      }
      await rpc.invoke('ChatCommand.cancel', 'cancel-test')
      assert.equal((await running).exitCode, 130)
    } finally {
      await rpc?.dispose()
      await controlRpc?.dispose()
      for (const socket of sockets) {
        socket.destroy()
      }
      server.closeAllConnections()
      const closed = Promise.withResolvers()
      try {
        server.close(closed.resolve)
      } catch (error) {
        closed.reject(error)
      }
      await closed.promise
      await rm(workspace, { recursive: true, force: true })
    }
  },
)
