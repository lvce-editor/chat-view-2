import { createNodeRpc } from '@lvce-editor/api'
import type {
  AgentExternalToolHost,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolImageOutput,
  AgentToolResult,
} from '../AgentToolHost/AgentToolHost.ts'

interface NodeRpc {
  readonly invoke: (
    method: string,
    ...params: readonly unknown[]
  ) => Promise<unknown>
}

interface McpToolAnnotations {
  readonly destructiveHint?: boolean
  readonly openWorldHint?: boolean
  readonly readOnlyHint?: boolean
}

interface McpToolDefinition {
  readonly annotations?: McpToolAnnotations
  readonly description?: string
  readonly inputSchema?: Readonly<Record<string, unknown>>
  readonly name?: string
}

interface McpContentBlock {
  readonly data?: string
  readonly mimeType?: string
  readonly text?: string
  readonly type?: string
}

interface McpToolResult {
  readonly content?: readonly McpContentBlock[]
  readonly isError?: boolean
}

interface CreateNodeRpcOptions {
  readonly id?: string
  readonly name?: string
  readonly path?: string
}

type CreateNodeRpc = (options: CreateNodeRpcOptions) => Promise<NodeRpc>

const computerUseRpcId = 'builtin.chat-view-2.computer-use'
const defaultCreateNodeRpcOptions = { id: computerUseRpcId }
const toolPrefix = 'computer_use_'
const maximumResultCharacters = 128_000
const supportedImageMimeTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const getSafetyDescription = (annotations?: McpToolAnnotations): string => {
  if (annotations?.destructiveHint || annotations?.openWorldHint) {
    return ' This can act on the live desktop and may cause external side effects; obtain user confirmation before committing consequential actions.'
  }
  if (annotations?.readOnlyHint) {
    return ' This observes the live desktop without intentionally changing it.'
  }
  return ' This can change focus, window geometry, or other live desktop state.'
}

const toAgentToolDefinition = (
  tool: McpToolDefinition,
): AgentToolDefinition | undefined => {
  if (typeof tool.name !== 'string' || !tool.name) {
    return undefined
  }
  return {
    description: `Linux computer use: ${tool.description || tool.name}.${getSafetyDescription(tool.annotations)}`,
    inputSchema: tool.inputSchema || {
      additionalProperties: false,
      properties: {},
      type: 'object',
    },
    name: `${toolPrefix}${tool.name}`,
  }
}

const formatContentBlock = (block: McpContentBlock): string => {
  if (block.type === 'text' && typeof block.text === 'string') {
    return block.text
  }
  if (block.type === 'image') {
    return `[Computer-use returned a ${block.mimeType || 'image'} screenshot containing ${block.data?.length || 0} base64 characters.]`
  }
  return JSON.stringify(block)
}

const toImageOutput = (
  block: McpContentBlock,
): AgentToolImageOutput | undefined => {
  if (
    block.type !== 'image' ||
    typeof block.data !== 'string' ||
    !block.data ||
    typeof block.mimeType !== 'string' ||
    !supportedImageMimeTypes.has(block.mimeType)
  ) {
    return undefined
  }
  return {
    detail: 'original',
    image_url: `data:${block.mimeType};base64,${block.data}`,
    type: 'input_image',
  }
}

const formatToolResult = (value: unknown): AgentToolResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      content: String(value),
      isError: false,
    }
  }
  const result = value as McpToolResult
  const contentBlocks = Array.isArray(result.content) ? result.content : []
  const content =
    contentBlocks.length > 0
      ? contentBlocks.map(formatContentBlock).join('\n')
      : JSON.stringify(value)
  const modelOutput = contentBlocks.flatMap((block) => {
    const image = toImageOutput(block)
    return image ? [image] : []
  })
  return {
    content: content.slice(0, maximumResultCharacters),
    isError: result.isError === true,
    ...(modelOutput.length > 0 && { modelOutput }),
  }
}

const parseArguments = (value: string): Readonly<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(value || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Computer-use tool arguments must be a JSON object')
  }
  return parsed as Readonly<Record<string, unknown>>
}

export const createComputerUseToolHost = async (
  options: CreateNodeRpcOptions = defaultCreateNodeRpcOptions,
  createRpc: CreateNodeRpc = createNodeRpc,
): Promise<AgentExternalToolHost> => {
  const rpc = await createRpc(options)
  const [toolsValue, skillValue] = await Promise.all([
    rpc.invoke('ComputerUse.listTools'),
    rpc.invoke('ComputerUse.getSkillInstructions'),
  ])
  const tools = Array.isArray(toolsValue)
    ? (toolsValue as readonly McpToolDefinition[])
    : []
  const definitions = tools.flatMap((tool) => {
    const definition = toAgentToolDefinition(tool)
    return definition ? [definition] : []
  })
  const instructions = [
    `Linux computer use is available through tools whose names start with ${toolPrefix}. Use computer_use_doctor first when readiness is unknown, prefer semantic accessibility selectors over pixel coordinates, and inspect state again after acting.`,
    'When the user asks to open an application that is not already running, call computer_use_launch_app instead of trying keyboard shortcuts or typing into a launcher. When the user asks to save a screenshot to a file, call computer_use_save_screenshot; computer_use_screenshot only observes an image and does not save it.',
    'When clicking coordinates from a window-cropped screenshot, pass the same window target and relative: true so the click uses the screenshot coordinate space.',
    'Treat the desktop as live external state. Ask the user before any action that could submit, send, purchase, delete, overwrite, publish, or otherwise commit consequential state.',
    typeof skillValue === 'string' ? skillValue.slice(0, 16_000) : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    async execute(call: AgentToolCall): Promise<AgentToolResult> {
      if (!call.name.startsWith(toolPrefix)) {
        return {
          content: `Unknown computer-use tool: ${call.name}`,
          isError: true,
        }
      }
      try {
        const result = await rpc.invoke(
          'ComputerUse.callTool',
          call.name.slice(toolPrefix.length),
          parseArguments(call.arguments),
        )
        return formatToolResult(result)
      } catch (error) {
        return {
          content: error instanceof Error ? error.message : String(error),
          isError: true,
        }
      }
    },
    getDefinitions(): readonly AgentToolDefinition[] {
      return definitions
    },
    getInstructions(): string {
      return instructions
    },
  }
}

const defaultHostState: {
  hostPromise?: Promise<AgentExternalToolHost | undefined>
} = {}

const tryCreateComputerUseToolHost = async (): Promise<
  AgentExternalToolHost | undefined
> => {
  try {
    return await createComputerUseToolHost()
  } catch {
    return undefined
  }
}

export const getDefaultComputerUseToolHost = async (): Promise<
  AgentExternalToolHost | undefined
> => {
  defaultHostState.hostPromise ||= tryCreateComputerUseToolHost()
  return defaultHostState.hostPromise
}
