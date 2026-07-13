/* eslint-disable sonarjs/no-nested-conditional, unicorn/max-nested-calls, unicorn/prefer-iterator-to-array */
import type { VirtualDomNode } from '@lvce-editor/virtual-dom-worker'
import type {
  ChatChangedFile,
  ChatModel,
  ChatTask,
  ChatTaskEvent,
} from '../ChatApi/ChatApi.ts'
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

const renderTaskList = (
  tasks: readonly ChatTask[],
  fontSize: string,
): Dom.TreeNode => {
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
  return Dom.div('ChatTaskList', tasks.map(renderTask), {
    style: `--ChatTaskFontSize: ${fontSize}`,
  })
}

const urlPattern = /https?:\/\/[^\s<>"']+/gu
const trailingPunctuation = new Set(['!', ',', '.', ':', ';', '?'])

const trimUrl = (value: string): string => {
  let url = value
  while (url && trailingPunctuation.has(url.at(-1) || '')) {
    url = url.slice(0, -1)
  }
  const pairs = [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ] as const
  for (const [opening, closing] of pairs) {
    const openingCount = url.split(opening).length - 1
    const closingCount = url.split(closing).length - 1
    if (closingCount > openingCount && url.endsWith(closing)) {
      url = url.slice(0, -1)
    }
  }
  return url
}

const renderMessageText = (text: string): readonly Dom.TreeNode[] => {
  const children: Dom.TreeNode[] = []
  let previousIndex = 0
  for (const match of text.matchAll(urlPattern)) {
    const matchIndex = match.index
    if (matchIndex > previousIndex) {
      children.push(Dom.textNode(text.slice(previousIndex, matchIndex)))
    }
    const matchedText = match[0]
    const url = trimUrl(matchedText)
    children.push(Dom.link(url, url, 'ChatMessageLink'))
    previousIndex = matchIndex + url.length
  }
  if (previousIndex < text.length) {
    children.push(Dom.textNode(text.slice(previousIndex)))
  }
  return children
}

const renderMessage = (
  message: Extract<
    ChatTaskEvent,
    { type: 'assistant-message' | 'user-message' }
  >,
): Dom.TreeNode => {
  const roleClass =
    message.type === 'user-message' ? 'ChatMessageUser' : 'ChatMessageAssistant'
  return Dom.div(`ChatMessage ${roleClass}`, [
    Dom.div('ChatMessageText', renderMessageText(message.text)),
  ])
}

const renderStreamingMessage = (text: string): Dom.TreeNode => {
  return Dom.div('ChatMessage ChatMessageAssistant ChatMessageStreaming', [
    Dom.div('ChatMessageText', renderMessageText(text)),
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

const renderFocusModeButton = (
  state: Readonly<ChatViewState>,
): readonly Dom.TreeNode[] => {
  if (!state.focusModeEnabled) {
    return []
  }
  return [
    Dom.button(
      'toggle-focus-mode',
      state.focusMode ? 'IDE' : 'Focus',
      'ChatFocusModeButton',
      {
        title: state.focusMode
          ? 'Return to IDE layout'
          : 'Focus entirely on chat',
      },
    ),
  ]
}

const getRootClassName = (
  state: Readonly<ChatViewState>,
  viewClassName: string,
): string => {
  return `ChatView ${viewClassName}${state.focusMode ? ' ChatFocusMode' : ''}`
}

const renderListView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  return Dom.div(getRootClassName(state, 'ChatListView'), [
    Dom.div('ChatTaskListHeader', [
      Dom.heading(1, 'ChatTitle', 'Tasks'),
      Dom.div('ChatHeaderSpacer', []),
      ...renderFocusModeButton(state),
      Dom.div('ChatTaskCount', [
        Dom.textNode(
          `${state.tasks.length} ${state.tasks.length === 1 ? 'task' : 'tasks'}`,
        ),
      ]),
    ]),
    ...(state.errorMessage
      ? [Dom.div('ChatErrorBanner', [Dom.textNode(state.errorMessage)])]
      : []),
    renderTaskList(state.tasks, state.fontSize),
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

const renderChangedFile = (file: ChatChangedFile): Dom.TreeNode => {
  const status =
    file.status === 'modified' ? 'M' : file.status === 'added' ? 'A' : 'D'
  return Dom.div('ChatChangedFile', [
    Dom.div('ChatChangedFileName', [Dom.textNode(`${status}  ${file.path}`)]),
    Dom.div('ChatChangedFileAdditions', [
      Dom.textNode(`+${file.additions || 0}`),
    ]),
    Dom.div('ChatChangedFileDeletions', [
      Dom.textNode(`-${file.deletions || 0}`),
    ]),
  ])
}

const renderChanges = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const task = state.selectedTask
  if (!task) {
    return Dom.div('ChatChangesHidden', [])
  }
  const { changedFiles, checksPassed } = summarizeTask(task)
  if (changedFiles.length === 0) {
    return Dom.div('ChatChangesHidden', [])
  }
  const additions = changedFiles.reduce((total, file) => {
    return total + (file.additions || 0)
  }, 0)
  const deletions = changedFiles.reduce((total, file) => {
    return total + (file.deletions || 0)
  }, 0)
  const fileLabel = `${changedFiles.length} ${changedFiles.length === 1 ? 'file' : 'files'} changed`
  return Dom.div('ChatChanges', [
    Dom.div('ChatChangesHeader', [
      Dom.div('ChatChangesSummary', [Dom.textNode(fileLabel)]),
      Dom.div('ChatChangeAdditions', [Dom.textNode(`+${additions}`)]),
      Dom.div('ChatChangeDeletions', [Dom.textNode(`-${deletions}`)]),
      Dom.div('ChatChangesSpacer', []),
      Dom.button(
        'toggle-changes',
        state.changesExpanded ? 'Hide' : 'Review',
        'ChatReviewButton',
        { ariaExpanded: state.changesExpanded },
      ),
    ]),
    ...(state.changesExpanded
      ? [
          Dom.div('ChatChangedFiles', changedFiles.map(renderChangedFile)),
          Dom.div('ChatChangesActions', [
            ...(checksPassed > 0
              ? [
                  Dom.div('ChatChecksPassed', [
                    Dom.textNode(`${checksPassed} checks passed`),
                  ]),
                ]
              : []),
            Dom.div('ChatChangesSpacer', []),
            Dom.button('revert', 'Revert', 'ChatRevertButton'),
          ]),
        ]
      : []),
  ])
}

const renderDetailView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const task = state.selectedTask
  if (!task) {
    return renderListView(state)
  }
  const summary = summarizeTask(task)
  return Dom.div(getRootClassName(state, 'ChatDetailView'), [
    Dom.div('ChatDetailHeader', [
      Dom.button('back', 'Back', 'ChatBackButton'),
      Dom.heading(1, 'ChatDetailTitle', task.title),
      ...renderFocusModeButton(state),
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
    ]),
    renderChanges(state),
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
