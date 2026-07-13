import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
/* eslint-disable sonarjs/cognitive-complexity, unicorn/prefer-await */
import {
  getPreference,
  setPreference,
  type ViewContext,
  type ViewEvent,
  type VirtualDomViewInstance,
} from '@lvce-editor/api'
import type { ChatApi, ChatTask } from '../ChatApi/ChatApi.ts'
import type { ChatViewState } from './ChatViewState.ts'
import { setStatus } from '../ChatTask/ChatTask.ts'
import { render } from './Render.ts'

export interface ActiveChatViewInstance extends VirtualDomViewInstance {
  readonly getContext: () => Readonly<Record<string, boolean>>
  readonly getState: () => Readonly<ChatViewState>
  readonly handleEvent: (event: Readonly<ViewEvent>) => Promise<void>
  readonly render: () => readonly VirtualDomNode[]
  readonly renderTitle: () => string
  readonly submit: (requestRerender?: boolean) => Promise<void>
}

interface SavedState {
  readonly selectedModelId?: string
  readonly selectedTaskId?: string
}

const getEventString = (event: Readonly<ViewEvent>): string => {
  return typeof event.value === 'string' ? event.value : ''
}

const getSavedState = (value: unknown): SavedState => {
  return value && typeof value === 'object' ? value : {}
}

const activeInstances = new Set<ActiveChatViewInstance>()

const getPreferredModelId = async (): Promise<string> => {
  try {
    const value = await getPreference('chat2.selectedModelId')
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

const getActiveInstance = (): ActiveChatViewInstance | undefined => {
  return activeInstances.values().toArray().at(-1)
}

export const submitActiveChatViewInstance = async (): Promise<void> => {
  await getActiveInstance()?.submit(true)
}

export const createInstance = async (
  context?: ViewContext,
  providedApi?: ChatApi,
): Promise<ActiveChatViewInstance> => {
  let api = providedApi
  if (!api) {
    const { createDefaultChatApi } =
      await import('../DefaultChatApi/DefaultChatApi.ts')
    api = await createDefaultChatApi()
  }
  const saved = getSavedState(context?.state)
  let errorMessage = ''
  const models = await api.listModels().catch((error: unknown) => {
    errorMessage = error instanceof Error ? error.message : String(error)
    return []
  })
  const tasks = await api.listTasks(20).catch((error: unknown) => {
    errorMessage = error instanceof Error ? error.message : String(error)
    return []
  })
  const preferredModelId =
    saved.selectedModelId || (await getPreferredModelId())
  const selectedModelId =
    models.find(
      (model) =>
        model.id === preferredModelId && model.available && model.planEligible,
    )?.id ||
    models.find((model) => model.available && model.planEligible)?.id ||
    ''
  const selectedTask = saved.selectedTaskId
    ? await api.getTask(saved.selectedTaskId).catch(() => undefined)
    : undefined
  const state: ChatViewState = {
    activityExpanded: false,
    composerFocused: false,
    draft: '',
    errorMessage,
    modelPickerOpen: false,
    models,
    selectedModelId,
    selectedTask,
    tasks,
  }
  let activeController: AbortController | undefined

  const updateTask = async (task: ChatTask): Promise<void> => {
    state.selectedTask = task
    state.tasks = [
      task,
      ...state.tasks.filter((item) => item.id !== task.id),
    ].slice(0, 20)
    await context?.requestRerender()
  }

  const submit = async (requestRerender = false): Promise<void> => {
    const message = state.draft.trim()
    if (!message || !state.selectedModelId) {
      return
    }
    state.draft = ''
    state.modelPickerOpen = false
    if (state.selectedTask?.status === 'running') {
      await api.steer(state.selectedTask.id, message)
      if (requestRerender) {
        await context?.requestRerender()
      }
      return
    }
    activeController = new AbortController()
    const options = {
      onUpdate: updateTask,
      signal: activeController.signal,
    }
    const selectedTask = state.selectedTask
      ? { ...state.selectedTask, modelId: state.selectedModelId }
      : undefined
    const task = selectedTask
      ? await api.sendMessage(selectedTask, message, options)
      : await api.createTask(message, state.selectedModelId, options)
    activeController = undefined
    await updateTask(task)
    if (requestRerender) {
      await context?.requestRerender()
    }
  }

  const instance: ActiveChatViewInstance = {
    dispose(): void {
      activeController?.abort()
      activeInstances.delete(instance)
    },
    getContext(): Readonly<Record<string, boolean>> {
      return {
        'chat2.composerFocus': state.composerFocused,
        'chat2.taskRunning': state.selectedTask?.status === 'running',
      }
    },
    getState(): Readonly<ChatViewState> {
      return state
    },
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      if (event.type === 'input' && event.name === 'composer') {
        state.composerFocused = true
        state.draft = getEventString(event)
        return
      }
      if (event.type === 'focus' && event.name === 'composer') {
        state.composerFocused = true
        return
      }
      if (event.type === 'blur' && event.name === 'composer') {
        state.composerFocused = false
        return
      }
      if (event.type !== 'click') {
        return
      }
      if (event.name === 'submit') {
        await submit()
        return
      }
      if (event.name === 'stop') {
        if (state.selectedTask?.status === 'running') {
          await updateTask(setStatus(state.selectedTask, 'stopping'))
        }
        activeController?.abort()
        return
      }
      if (event.name === 'back' || event.name === 'new-task') {
        state.selectedTask = undefined
        state.draft = ''
        state.activityExpanded = false
        return
      }
      if (event.name === 'model-picker') {
        state.modelPickerOpen = !state.modelPickerOpen
        return
      }
      if (event.name === 'toggle-activity') {
        state.activityExpanded = !state.activityExpanded
        return
      }
      if (event.name === 'revert' && state.selectedTask) {
        try {
          await updateTask(await api.revertTask(state.selectedTask))
          state.errorMessage = ''
        } catch (error) {
          state.errorMessage =
            error instanceof Error ? error.message : String(error)
          await context?.requestRerender()
        }
        return
      }
      if (event.name?.startsWith('model:')) {
        const id = event.name.slice(6)
        const model = state.models.find((item) => item.id === id)
        if (model?.available && model.planEligible) {
          state.selectedModelId = id
          state.modelPickerOpen = false
          await setPreference('chat2.selectedModelId', id)
        }
        return
      }
      if (event.name?.startsWith('task:')) {
        state.selectedTask = await api.getTask(event.name.slice(5))
        if (state.selectedTask) {
          state.selectedModelId = state.selectedTask.modelId
        }
        state.draft = ''
        state.activityExpanded = false
      }
    },
    render(): readonly VirtualDomNode[] {
      return render(state)
    },
    renderTitle(): string {
      return state.selectedTask
        ? `Chat 2: ${state.selectedTask.title}`
        : 'Chat 2'
    },
    saveState(): unknown {
      return {
        selectedModelId: state.selectedModelId,
        selectedTaskId: state.selectedTask?.id,
      }
    },
    submit,
  }
  activeInstances.add(instance)
  return instance
}
