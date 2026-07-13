import type {
  ViewContext,
  ViewEvent,
  VirtualDomViewInstance,
} from '@lvce-editor/api'
import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import type { ChatApi } from '../ChatApi/ChatApi.ts'
import type { ChatViewState } from './ChatViewState.ts'
import { createMockChatApi } from '../MockChatApi/MockChatApi.ts'
import { render } from './Render.ts'

export interface ActiveChatViewInstance extends VirtualDomViewInstance {
  readonly getContext: () => Readonly<Record<string, boolean>>
  readonly getState: () => Readonly<ChatViewState>
  readonly handleEvent: (event: Readonly<ViewEvent>) => Promise<void>
  readonly render: () => readonly VirtualDomNode[]
  readonly renderTitle: () => string
  readonly submit: () => Promise<void>
}

const getEventString = (event: Readonly<ViewEvent>): string => {
  return typeof event.value === 'string' ? event.value : ''
}

export const createInstance = async (
  _context?: ViewContext,
  api: ChatApi = createMockChatApi(),
): Promise<ActiveChatViewInstance> => {
  const state: ChatViewState = {
    composerFocused: false,
    draft: '',
    selectedTask: undefined,
    tasks: await api.listTasks(20),
  }

  const submit = async (): Promise<void> => {
    const message = state.draft.trim()
    if (!message) {
      return
    }
    const task = state.selectedTask
      ? await api.sendMessage(state.selectedTask, message)
      : await api.createTask(message)
    state.draft = ''
    state.selectedTask = task
    state.tasks = [
      task,
      ...state.tasks.filter((item) => item.id !== task.id),
    ].slice(0, 20)
  }

  return {
    getContext(): Readonly<Record<string, boolean>> {
      return {
        'chat2.composerFocus': state.composerFocused,
      }
    },
    getState(): Readonly<ChatViewState> {
      return state
    },
    async handleEvent(event: Readonly<ViewEvent>): Promise<void> {
      if (event.type === 'input' && event.name === 'composer') {
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
      if (event.name === 'back') {
        state.selectedTask = undefined
        return
      }
      if (event.name?.startsWith('task:')) {
        state.selectedTask = await api.getTask(event.name.slice(5))
        state.draft = ''
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
        selectedTaskId: state.selectedTask?.id,
      }
    },
    submit,
  }
}
