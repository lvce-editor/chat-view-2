import { getPreference } from '@lvce-editor/api'
import type { ChatApi } from '../ChatApi/ChatApi.ts'
import { createAgentChatApi } from '../AgentChatApi/AgentChatApi.ts'
import { createAgentToolHost } from '../AgentToolHost/AgentToolHost.ts'
import { createMockChatApi } from '../MockChatApi/MockChatApi.ts'
import { createResponsesBackend } from '../ResponsesBackend/ResponsesBackend.ts'
import { createIndexedDbTaskStore } from '../TaskStore/TaskStore.ts'

const getStringPreference = async (key: string): Promise<string> => {
  try {
    const value = await getPreference(key)
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

export const createDefaultChatApi = async (): Promise<ChatApi> => {
  const baseUrl = await getStringPreference('chat2.backendUrl')
  if (!baseUrl) {
    return createMockChatApi(120)
  }
  return createAgentChatApi({
    backend: createResponsesBackend({
      baseUrl,
    }),
    store: createIndexedDbTaskStore(),
    toolHost: createAgentToolHost(),
  })
}
