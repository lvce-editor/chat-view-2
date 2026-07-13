import type { ChatApi } from '../ChatApi/ChatApi.ts'
import { createAgentChatApi } from '../AgentChatApi/AgentChatApi.ts'
import { createAgentToolHost } from '../AgentToolHost/AgentToolHost.ts'
import { resolveBackendConfiguration } from '../BackendConfiguration/BackendConfiguration.ts'
import { createMockChatApi } from '../MockChatApi/MockChatApi.ts'
import { createResponsesBackend } from '../ResponsesBackend/ResponsesBackend.ts'
import { createIndexedDbTaskStore } from '../TaskStore/TaskStore.ts'

export const createDefaultChatApi = async (): Promise<ChatApi> => {
  const { accessToken, baseUrl } = await resolveBackendConfiguration()
  if (!baseUrl) {
    return createMockChatApi(120)
  }
  return createAgentChatApi({
    backend: createResponsesBackend({
      accessToken,
      baseUrl,
    }),
    store: createIndexedDbTaskStore(),
    toolHost: createAgentToolHost(),
  })
}
