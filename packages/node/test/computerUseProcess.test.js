import {
  NodeForkedProcessRpcParent,
  WebSocketRpcParent,
} from '@lvce-editor/rpc'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const computerUseSkillPattern = /computer-use-linux/u

test(
  'starts the packaged computer-use process and invokes a command',
  { skip: process.platform !== 'linux' },
  async () => {
    const server = createServer()
    const sockets = new Set()
    let controlRpc
    let rpc
    try {
      const processPath = fileURLToPath(
        new URL(
          '../../../dist/node/src/computerUseProcess.js',
          import.meta.url,
        ),
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
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      const webSocket = new WebSocket(`ws://127.0.0.1:${address.port}`)
      rpc = await WebSocketRpcParent.create({ commandMap: {}, webSocket })
      await attached

      const instructions = await rpc.invoke('ComputerUse.getSkillInstructions')

      assert.equal(typeof instructions, 'string')
      assert.match(instructions, computerUseSkillPattern)
    } finally {
      await rpc?.dispose()
      await controlRpc?.dispose()
      for (const socket of sockets) {
        socket.destroy()
      }
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  },
)
