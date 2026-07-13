/* eslint-disable sonarjs/no-nested-conditional, unicorn/max-nested-calls, unicorn/prefer-iterator-to-array */
import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import type { ChatModel, ChatTask, ChatTaskEvent } from '../ChatApi/ChatApi.ts'
import type { ChatViewState } from './ChatViewState.ts'
import { summarizeTask } from '../ChatTask/ChatTask.ts'
import * as Dom from '../VirtualDom/VirtualDom.ts'

const isRunning = (task: ChatTask | undefined): boolean => {
  return task?.status === 'running' || task?.status === 'stopping'
}

const getStatusLabel = (task: ChatTask): string => {
  switch (task.status) {
    case 'failed':
      return 'Failed'
    case 'running':
      return 'Working'
    case 'stopping':
      return 'Stopping'
    default:
      return ''
  }
}

const renderTask = (task: ChatTask): Dom.TreeNode => {
  const status = getStatusLabel(task)
  return Dom.button(
    `task:${task.id}`,
    status ? `${task.title} · ${status}` : task.title,
    `ChatTaskButton ChatTaskStatus-${task.status}`,
  )
}

const renderTaskList = (tasks: readonly ChatTask[]): Dom.TreeNode => {
  if (tasks.length === 0) {
    return Dom.div('ChatEmptyState', [
      Dom.heading(2, 'ChatEmptyTitle', 'Start with a programming task'),
      Dom.div('ChatEmptyText', [
        Dom.textNode(
          'Chat 2 will inspect the workspace, make changes, and verify them.',
        ),
      ]),
    ])
  }
  return Dom.div('ChatTaskList', tasks.map(renderTask))
}

const renderMessage = (
  message: Extract<
    ChatTaskEvent,
    { type: 'assistant-message' | 'user-message' }
  >,
): Dom.TreeNode => {
  const author = message.type === 'user-message' ? 'You' : 'Chat 2'
  const roleClass =
    message.type === 'user-message' ? 'ChatMessageUser' : 'ChatMessageAssistant'
  return Dom.div(`ChatMessage ${roleClass}`, [
    Dom.div('ChatMessageAuthor', [Dom.textNode(author)]),
    Dom.div('ChatMessageText', [Dom.textNode(message.text)]),
  ])
}

const renderStreamingMessage = (text: string): Dom.TreeNode => {
  return Dom.div('ChatMessage ChatMessageAssistant ChatMessageStreaming', [
    Dom.div('ChatMessageAuthor', [Dom.textNode('Chat 2')]),
    Dom.div('ChatMessageText', [Dom.textNode(text)]),
  ])
}

const renderModel = (model: ChatModel): Dom.TreeNode => {
  const unavailable = !model.available || !model.planEligible
  const suffix = unavailable ? ' · unavailable on this plan' : ''
  return Dom.button(
    `model:${model.id}`,
    `${model.label}${suffix}`,
    'ChatModelOption',
    {
      disabled: unavailable,
      title: unavailable
        ? 'This model is not available on your plan'
        : model.label,
    },
  )
}

const renderModelPicker = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  if (!state.modelPickerOpen) {
    return Dom.div('ChatModelPickerHidden', [])
  }
  return Dom.div('ChatModelPicker', [
    Dom.div('ChatModelPickerTitle', [Dom.textNode('OpenAI models')]),
    ...state.models.map(renderModel),
  ])
}

const getSelectedModelLabel = (state: Readonly<ChatViewState>): string => {
  return (
    state.models.find((model) => model.id === state.selectedModelId)?.label ||
    'Choose model'
  )
}

const renderComposer = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const running = isRunning(state.selectedTask)
  const placeholder = running
    ? 'Steer the current task'
    : state.selectedTask
      ? 'Ask for a follow-up change'
      : 'Describe a programming task'
  return Dom.div('ChatComposerArea', [
    renderModelPicker(state),
    Dom.form('composer', 'ChatComposer', [
      Dom.textArea(state.draft, placeholder),
      Dom.div('ChatComposerControls', [
        Dom.div('ChatComposerSpacer', []),
        Dom.button(
          'model-picker',
          getSelectedModelLabel(state),
          'ChatModelButton',
          { ariaExpanded: state.modelPickerOpen },
        ),
        ...(running ? [Dom.button('stop', 'Stop', 'ChatStopButton')] : []),
        Dom.button('submit', '↑', 'ChatSubmitButton', {
          ariaLabel: running ? 'Steer task' : 'Send message',
          disabled: !state.draft.trim() || !state.selectedModelId,
          title: running ? 'Steer task' : 'Send message',
        }),
      ]),
    ]),
  ])
}

const renderListView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  return Dom.div('ChatView ChatListView', [
    Dom.div('ChatTaskListHeader', [
      Dom.heading(1, 'ChatTitle', 'Tasks'),
      Dom.div('ChatTaskCount', [
        Dom.textNode(
          `${state.tasks.length} ${state.tasks.length === 1 ? 'task' : 'tasks'}`,
        ),
      ]),
    ]),
    ...(state.errorMessage
      ? [Dom.div('ChatErrorBanner', [Dom.textNode(state.errorMessage)])]
      : []),
    renderTaskList(state.tasks),
    renderComposer(state),
  ])
}

const getLatestActivities = (
  activities: readonly Extract<ChatTaskEvent, { type: 'activity' }>[],
): readonly Extract<ChatTaskEvent, { type: 'activity' }>[] => {
  const latest = new Map<string, Extract<ChatTaskEvent, { type: 'activity' }>>()
  for (const activity of activities) {
    latest.set(activity.label, activity)
  }
  return [...latest.values()].slice(-8)
}

const renderActivity = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const task = state.selectedTask
  if (!task) {
    return Dom.div('ChatActivityHidden', [])
  }
  const activities = getLatestActivities(summarizeTask(task).activities)
  if (activities.length === 0 && !isRunning(task)) {
    return Dom.div('ChatActivityHidden', [])
  }
  const current = activities.at(-1)
  const label = isRunning(task)
    ? current?.label || 'Working'
    : `${activities.length} ${activities.length === 1 ? 'step' : 'steps'} completed`
  return Dom.div('ChatActivity', [
    Dom.button('toggle-activity', label, 'ChatActivityToggle', {
      ariaExpanded: state.activityExpanded,
    }),
    ...(state.activityExpanded
      ? activities.map((activity) =>
          Dom.div(`ChatActivityItem ChatActivity-${activity.status}`, [
            Dom.div('ChatActivityLabel', [Dom.textNode(activity.label)]),
            ...(activity.detail
              ? [Dom.div('ChatActivityDetail', [Dom.textNode(activity.detail)])]
              : []),
          ]),
        )
      : []),
  ])
}

const renderChanges = (task: ChatTask): Dom.TreeNode => {
  const { changedFiles, checksPassed } = summarizeTask(task)
  if (changedFiles.length === 0) {
    return Dom.div('ChatChangesHidden', [])
  }
  const summary = `Changed ${changedFiles.length} ${changedFiles.length === 1 ? 'file' : 'files'}${
    checksPassed > 0 ? ` · ${checksPassed} checks passed` : ''
  }`
  return Dom.div('ChatChanges', [
    Dom.div('ChatChangesHeader', [
      Dom.div('ChatChangesSummary', [Dom.textNode(summary)]),
      Dom.button('revert', 'Revert', 'ChatRevertButton'),
    ]),
    ...changedFiles.map((file) =>
      Dom.div('ChatChangedFile', [
        Dom.textNode(
          `${file.status === 'modified' ? 'M' : file.status === 'added' ? 'A' : 'D'}  ${file.path}`,
        ),
      ]),
    ),
  ])
}

const renderDetailView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const task = state.selectedTask
  if (!task) {
    return renderListView(state)
  }
  const summary = summarizeTask(task)
  return Dom.div('ChatView ChatDetailView', [
    Dom.div('ChatDetailHeader', [
      Dom.button('back', 'Back', 'ChatBackButton'),
      Dom.heading(1, 'ChatDetailTitle', task.title),
      Dom.button('new-task', 'New', 'ChatNewTaskButton'),
    ]),
    Dom.div('ChatMessages', [
      ...summary.messages.map(renderMessage),
      ...(task.streamingText
        ? [renderStreamingMessage(task.streamingText)]
        : []),
      renderActivity(state),
      ...(summary.errorMessage
        ? [Dom.div('ChatErrorBanner', [Dom.textNode(summary.errorMessage)])]
        : []),
      ...(state.errorMessage
        ? [Dom.div('ChatErrorBanner', [Dom.textNode(state.errorMessage)])]
        : []),
      renderChanges(task),
    ]),
    renderComposer(state),
  ])
}

export const render = (
  state: Readonly<ChatViewState>,
): readonly VirtualDomNode[] => {
  return Dom.flatten(
    state.selectedTask ? renderDetailView(state) : renderListView(state),
  )
}
