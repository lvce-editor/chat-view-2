import type { ChatApi } from '../ChatApi/ChatApi.ts'
import { createAgentChatApi } from '../AgentChatApi/AgentChatApi.ts'
import {
  createAgentToolHost,
  type AgentFileSystemAccess,
} from '../AgentToolHost/AgentToolHost.ts'
import { resolveBackendConfiguration } from '../BackendConfiguration/BackendConfiguration.ts'
import { createMockChatApi } from '../MockChatApi/MockChatApi.ts'
import { createNodeCommandExecutor } from '../NodeCommandExecutor/NodeCommandExecutor.ts'
import { createResponsesBackend } from '../ResponsesBackend/ResponsesBackend.ts'
import { createIndexedDbTaskStore } from '../TaskStore/TaskStore.ts'

export interface DefaultChatApiOptions {
  readonly fileSystemAccess?: AgentFileSystemAccess
}

export const createDefaultChatApi = async ({
  fileSystemAccess,
}: DefaultChatApiOptions = {}): Promise<ChatApi> => {
  const { accessToken, baseUrl, supportsStreaming } =
    await resolveBackendConfiguration()
  if (!baseUrl) {
    return createMockChatApi(120)
  }
  const commandExecutor = createNodeCommandExecutor()
  return createAgentChatApi({
    backend: createResponsesBackend({
      accessToken,
      baseUrl,
      supportsStreaming,
    }),
    store: createIndexedDbTaskStore(),
    toolHost: createAgentToolHost({
      ...(commandExecutor && { commandExecutor }),
      ...(fileSystemAccess && { fileSystemAccess }),
    }),
  })
}
