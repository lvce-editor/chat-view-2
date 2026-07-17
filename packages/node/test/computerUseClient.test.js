import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getComputerUseEnvironment } from '../src/computerUseClient.js'

test('runs the computer-use server as Node when hosted by Electron', () => {
  const environment = getComputerUseEnvironment({ HOME: '/home/test' })

  assert.deepEqual(environment, {
    ELECTRON_RUN_AS_NODE: '1',
    HOME: '/home/test',
  })
})
