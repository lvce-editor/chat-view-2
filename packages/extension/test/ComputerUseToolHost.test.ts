import { expect, jest, test } from '@jest/globals'
import { createComputerUseToolHost } from '../src/parts/ComputerUseToolHost/ComputerUseToolHost.ts'

test('loads prefixed computer-use tools and bundled skill instructions', async () => {
  const invoke = jest.fn(async (method: string): Promise<unknown> => {
    if (method === 'ComputerUse.listTools') {
      return [
        {
          annotations: { readOnlyHint: true },
          description: 'Inspect desktop readiness.',
          inputSchema: { properties: {}, type: 'object' },
          name: 'doctor',
        },
      ]
    }
    if (method === 'ComputerUse.getSkillInstructions') {
      return '# Computer use skill\nInspect before acting.'
    }
    throw new Error(`Unexpected method: ${method}`)
  })
  const host = await createComputerUseToolHost(
    '/extensions/chat/node/src/computerUseClient.js',
    async () => ({ invoke }),
  )

  expect(host.getDefinitions()).toEqual([
    expect.objectContaining({
      name: 'computer_use_doctor',
    }),
  ])
  expect(host.getDefinitions()[0]?.description).toContain(
    'observes the live desktop',
  )
  expect(host.getInstructions()).toContain('Computer use skill')
  expect(host.getInstructions()).toContain('Ask the user')
})

test('delegates prefixed tool calls and keeps screenshot payloads bounded', async () => {
  const invoke = jest.fn<
    (method: string, ...params: readonly unknown[]) => Promise<unknown>
  >(async (method: string): Promise<unknown> => {
    if (method === 'ComputerUse.listTools') {
      return [{ inputSchema: { type: 'object' }, name: 'screenshot' }]
    }
    if (method === 'ComputerUse.getSkillInstructions') {
      return ''
    }
    if (method === 'ComputerUse.callTool') {
      return {
        content: [
          {
            data: 'encoded-image',
            mimeType: 'image/png',
            type: 'image',
          },
        ],
      }
    }
    throw new Error(`Unexpected method: ${method}`)
  })
  const host = await createComputerUseToolHost('node-entry.js', async () => ({
    invoke,
  }))

  await expect(
    host.execute({
      arguments: '{"window":"Editor"}',
      callId: 'call-1',
      name: 'computer_use_screenshot',
    }),
  ).resolves.toEqual({
    content: expect.stringContaining('Image rendering in tool results'),
    isError: false,
  })
  expect(invoke).toHaveBeenCalledWith('ComputerUse.callTool', 'screenshot', {
    window: 'Editor',
  })
})
