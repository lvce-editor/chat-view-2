import type { AgentFileSystemAccess } from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import type { ChatApi } from '../ChatApi/ChatApi.ts'
import { createAgentChatApi } from '../AgentChatApi/AgentChatApi.ts'
import {
  type BackendConfiguration,
  resolveBackendConfiguration,
} from '../BackendConfiguration/BackendConfiguration.ts'
import { createRemoteAgentToolHost } from '../ChatToolWorker/ChatToolWorker.ts'
import { createMockChatApi } from '../MockChatApi/MockChatApi.ts'
import { createResponsesBackend } from '../ResponsesBackend/ResponsesBackend.ts'
import { createIndexedDbTaskStore } from '../TaskStore/TaskStore.ts'

export interface DefaultChatApiOptions {
  readonly accessToken?: string
  readonly configuration?: BackendConfiguration
  readonly fileSystemAccess?: AgentFileSystemAccess
}

export const createDefaultChatApi = async ({
  accessToken: providedAccessToken,
  configuration: providedConfiguration,
  fileSystemAccess,
}: DefaultChatApiOptions = {}): Promise<ChatApi> => {
  const { accessToken, baseUrl, supportsStreaming } =
    providedConfiguration ||
    (await resolveBackendConfiguration(undefined, providedAccessToken))
  if (!baseUrl) {
    return createMockChatApi(120)
  }
  return createAgentChatApi({
    backend: createResponsesBackend({
      accessToken,
      baseUrl,
      supportsStreaming,
    }),
    store: createIndexedDbTaskStore(),
    toolHost: await createRemoteAgentToolHost(fileSystemAccess),
  })
}
