import type { ChatMessage, ChatTask } from '../ChatApi/ChatApi.ts'
import * as Dom from '../VirtualDom/VirtualDom.ts'
import type { ChatViewState } from './ChatViewState.ts'

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

const renderComposer = (draft: string): Dom.TreeNode => {
  return Dom.form('composer', 'ChatComposer', [
    Dom.textArea(draft),
    Dom.button('submit', 'Send', 'ChatSubmitButton'),
  ])
}

const renderListView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  return Dom.div('ChatView ChatListView', [
    Dom.div('ChatTaskListHeader', [
      Dom.heading(1, 'ChatTitle', 'Past tasks'),
      Dom.div('ChatTaskCount', [
        Dom.textNode(`${state.tasks.length} mock tasks`),
      ]),
    ]),
    renderTaskList(state.tasks),
    renderComposer(state.draft),
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
    renderComposer(state.draft),
  ])
}

export const render = (
  state: Readonly<ChatViewState>,
): readonly import('@lvce-editor/virtual-dom-worker').VirtualDomNode[] => {
  const tree = state.selectedTask
    ? renderDetailView(state)
    : renderListView(state)
  return Dom.flatten(tree)
}
