import type { ChatApi } from '../ChatApi/ChatApi.ts'
import { createAgentChatApi } from '../AgentChatApi/AgentChatApi.ts'
import {
  createAgentToolHost,
  type AgentFileSystemAccess,
} from '../AgentToolHost/AgentToolHost.ts'
import { resolveBackendConfiguration } from '../BackendConfiguration/BackendConfiguration.ts'
import { getDefaultComputerUseToolHost } from '../ComputerUseToolHost/ComputerUseToolHost.ts'
import { createMockChatApi } from '../MockChatApi/MockChatApi.ts'
import { createNodeCommandExecutor } from '../NodeCommandExecutor/NodeCommandExecutor.ts'
import { createResponsesBackend } from '../ResponsesBackend/ResponsesBackend.ts'
import { createIndexedDbTaskStore } from '../TaskStore/TaskStore.ts'

export interface DefaultChatApiOptions {
  readonly accessToken?: string
  readonly fileSystemAccess?: AgentFileSystemAccess
}

export const createDefaultChatApi = async ({
  accessToken: providedAccessToken,
  fileSystemAccess,
}: DefaultChatApiOptions = {}): Promise<ChatApi> => {
  const { accessToken, baseUrl, supportsStreaming } =
    await resolveBackendConfiguration(undefined, providedAccessToken)
  if (!baseUrl) {
    return createMockChatApi(120)
  }
  const commandExecutor = createNodeCommandExecutor()
  const externalToolHost = await getDefaultComputerUseToolHost()
  return createAgentChatApi({
    backend: createResponsesBackend({
      accessToken,
      baseUrl,
      supportsStreaming,
    }),
    store: createIndexedDbTaskStore(),
    toolHost: createAgentToolHost({
      ...(commandExecutor && { commandExecutor }),
      ...(externalToolHost && { externalToolHost }),
      ...(fileSystemAccess && { fileSystemAccess }),
    }),
  })
}
