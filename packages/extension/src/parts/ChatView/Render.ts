import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import type { ChatMessage, ChatTask } from '../ChatApi/ChatApi.ts'
import type { ChatViewState } from './ChatViewState.ts'
import * as Dom from '../VirtualDom/VirtualDom.ts'

const renderTask = (task: ChatTask): Dom.TreeNode => {
  return Dom.button(`task:${task.id}`, task.title, 'ChatTaskButton')
}

const renderTaskList = (tasks: readonly ChatTask[]): Dom.TreeNode => {
  return Dom.div('ChatTaskList', tasks.map(renderTask))
}

const renderMessage = (message: ChatMessage): Dom.TreeNode => {
  const author = message.role === 'user' ? 'You' : 'Chat 2'
  const roleClass =
    message.role === 'user' ? 'ChatMessageUser' : 'ChatMessageAssistant'
  return Dom.div(`ChatMessage ${roleClass}`, [
    Dom.div('ChatMessageAuthor', [Dom.textNode(author)]),
    Dom.div('ChatMessageText', [Dom.textNode(message.text)]),
  ])
}

const renderComposer = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  return Dom.form('composer', 'ChatComposer', [
    Dom.textArea(state.draft, state.composerFocused),
    Dom.button('submit', 'Send', 'ChatSubmitButton'),
  ])
}

const renderListView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const taskCount = Dom.textNode(`${state.tasks.length} mock tasks`)
  return Dom.div('ChatView ChatListView', [
    Dom.div('ChatTaskListHeader', [
      Dom.heading(1, 'ChatTitle', 'Past tasks'),
      Dom.div('ChatTaskCount', [taskCount]),
    ]),
    renderTaskList(state.tasks),
    renderComposer(state),
  ])
}

const renderDetailView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const task = state.selectedTask
  if (!task) {
    return renderListView(state)
  }
  return Dom.div('ChatView ChatDetailView', [
    Dom.div('ChatDetailHeader', [
      Dom.button('back', 'Back', 'ChatBackButton'),
      Dom.heading(1, 'ChatDetailTitle', task.title),
    ]),
    Dom.div('ChatMessages', task.messages.map(renderMessage)),
    renderComposer(state),
  ])
}

export const render = (
  state: Readonly<ChatViewState>,
): readonly VirtualDomNode[] => {
  const tree = state.selectedTask
    ? renderDetailView(state)
    : renderListView(state)
  return Dom.flatten(tree)
}
