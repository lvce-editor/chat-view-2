import type { AgentFileSystemAccess } from '@lvce-editor/chat-tool-worker/parts/AgentToolHost/AgentToolHost.ts'
import { getWorkspaceUri } from '@lvce-editor/api'
import type { ChatApi } from '../ChatApi/ChatApi.ts'
import { createAgentChatApi } from '../AgentChatApi/AgentChatApi.ts'
import {
  type BackendConfiguration,
  resolveBackendConfiguration,
} from '../BackendConfiguration/BackendConfiguration.ts'
import { createRemoteAgentToolHost } from '../ChatToolWorker/ChatToolWorker.ts'
import { createMockChatApi } from '../MockChatApi/MockChatApi.ts'
import { createAccountTaskStore } from '../RemoteTaskStore/RemoteTaskStore.ts'
import { createResponsesBackend } from '../ResponsesBackend/ResponsesBackend.ts'
import { createIndexedDbTaskStore } from '../TaskStore/TaskStore.ts'

export interface DefaultChatApiOptions {
  readonly accessToken?: string
  readonly configuration?: BackendConfiguration
  readonly fileSystemAccess?: AgentFileSystemAccess
  readonly onLoginRequired?: () => void
}

export const createDefaultChatApi = async ({
  accessToken: providedAccessToken,
  configuration: providedConfiguration,
  fileSystemAccess,
  onLoginRequired,
}: DefaultChatApiOptions = {}): Promise<ChatApi> => {
  const {
    accessToken,
    accountStorage,
    baseUrl,
    openAiWebSearch = true,
    refreshAccessToken,
    responseMethod,
    titleModelId = 'gpt-6-luna',
    useMockBackend = false,
  } = providedConfiguration ||
  (await resolveBackendConfiguration(undefined, providedAccessToken))
  if (useMockBackend) {
    return createMockChatApi(120)
  }
  return createAgentChatApi({
    backend: createResponsesBackend({
      accessToken,
      baseUrl,
      openAiWebSearch,
      ...(onLoginRequired && { onLoginRequired }),
      ...(refreshAccessToken && { refreshAccessToken }),
      responseMethod,
    }),
    createToolHost: (task) =>
      createRemoteAgentToolHost(fileSystemAccess, task.workspaceUri || ''),
    store: accountStorage
      ? await createAccountTaskStore({
          accessToken,
          baseUrl,
          ...(refreshAccessToken && { refreshAccessToken }),
        })
      : createIndexedDbTaskStore(),
    titleModelId,
    workspaceUriProvider: async () => {
      try {
        return await getWorkspaceUri()
      } catch {
        return ''
      }
    },
  })
}
