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
        {
          description: 'Launch an installed application.',
          inputSchema: { properties: {}, type: 'object' },
          name: 'launch_app',
        },
        {
          description: 'Save a screenshot.',
          inputSchema: { properties: {}, type: 'object' },
          name: 'save_screenshot',
        },
      ]
    }
    if (method === 'ComputerUse.getSkillInstructions') {
      return '# Computer use skill\nInspect before acting.'
    }
    throw new Error(`Unexpected method: ${method}`)
  })
  const createRpc = jest.fn(async (_options: unknown) => ({ invoke }))
  const host = await createComputerUseToolHost(undefined, createRpc)

  expect(createRpc).toHaveBeenCalledWith({
    id: 'builtin.chat-view-2.computer-use',
  })
  expect(host.getDefinitions()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'computer_use_doctor',
      }),
      expect.objectContaining({
        name: 'computer_use_launch_app',
      }),
      expect.objectContaining({
        name: 'computer_use_save_screenshot',
      }),
    ]),
  )
  expect(host.getDefinitions()[0]?.description).toContain(
    'observes the live desktop',
  )
  expect(host.getInstructions()).toContain('Computer use skill')
  expect(host.getInstructions()).toContain('Ask the user')
  expect(host.getInstructions()).toContain('computer_use_launch_app')
  expect(host.getInstructions()).toContain('computer_use_save_screenshot')
  expect(host.getInstructions()).toContain('relative: true')
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
  const host = await createComputerUseToolHost(
    { path: 'node-entry.js' },
    async () => ({
      invoke,
    }),
  )

  await expect(
    host.execute({
      arguments: '{"window":"Editor"}',
      callId: 'call-1',
      name: 'computer_use_screenshot',
    }),
  ).resolves.toEqual({
    content: expect.stringContaining('Computer-use returned a image/png'),
    isError: false,
    modelOutput: [
      {
        detail: 'original',
        image_url: 'data:image/png;base64,encoded-image',
        type: 'input_image',
      },
    ],
  })
  expect(invoke).toHaveBeenCalledWith('ComputerUse.callTool', 'screenshot', {
    window: 'Editor',
  })
})
