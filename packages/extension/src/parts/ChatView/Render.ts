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

const getMessageDateFormatter = (() => {
  let messageDateFormatter: Intl.DateTimeFormat | undefined
  return (): Intl.DateTimeFormat => {
    messageDateFormatter ??= new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    return messageDateFormatter
  }
})()

const formatMessageDate = (timestamp: string): string => {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? timestamp
    : getMessageDateFormatter().format(date)
}

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
  return Dom.div('ChatTaskItem', [
    Dom.button(
      `task:${task.id}`,
      status ? `${task.title} · ${status}` : task.title,
      `ChatTaskButton ChatTaskStatus-${task.status}`,
    ),
    Dom.iconButton(
      `archive-task:${task.id}`,
      'ChatTaskArchiveButton',
      'ChatTaskArchiveIcon',
      `Archive ${task.title}`,
      'Archive',
    ),
  ])
}

const renderTaskList = (
  tasks: readonly ChatTask[],
  fontFamily: string,
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
    style: `--ChatTaskFontFamily: ${fontFamily}; --ChatTaskFontSize: ${fontSize}`,
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
  copiedMessageId: string,
): Dom.TreeNode => {
  const roleClass =
    message.type === 'user-message' ? 'ChatMessageUser' : 'ChatMessageAssistant'
  const copied = message.id === copiedMessageId
  return Dom.div(`ChatMessage ${roleClass}`, [
    Dom.div('ChatMessageText', renderMessageText(message.text)),
    ...(message.type === 'user-message'
      ? [
          Dom.div('ChatMessageMetadata', [
            Dom.div('ChatMessageTimestamp', [
              Dom.textNode(formatMessageDate(message.timestamp)),
            ]),
            Dom.button(
              `copy-message:${message.id}`,
              '',
              `ChatMessageCopyButton${copied ? ' ChatMessageCopyButtonCopied' : ''}`,
              {
                ariaLabel: copied ? 'Copied' : 'Copy message',
                title: copied ? 'Copied' : 'Copy message',
              },
            ),
          ]),
        ]
      : []),
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
      Dom.div('ChatComposerInputContainer', [
        Dom.textArea(state.draft, placeholder),
      ]),
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
    renderTaskList(state.tasks, state.fontFamily, state.fontSize),
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
  const label = isRunning(task)
    ? `Working for ${state.workingSeconds} ${state.workingSeconds === 1 ? 'second' : 'seconds'}`
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

const visibleChangedFileCount = 3

const renderChangedFile = (file: ChatChangedFile): Dom.TreeNode => {
  return Dom.div(`ChatChangedFile ChatChangedFile-${file.status}`, [
    Dom.div('ChatChangedFileName', [Dom.textNode(file.path)]),
    Dom.div('ChatChangedFileStats', [
      Dom.div('ChatChangedFileAdditions', [
        Dom.textNode(`+${file.additions || 0}`),
      ]),
      Dom.div('ChatChangedFileDeletions', [
        Dom.textNode(`-${file.deletions || 0}`),
      ]),
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
  const hiddenFileCount = Math.max(
    0,
    changedFiles.length - visibleChangedFileCount,
  )
  const files = state.changesExpanded
    ? changedFiles
    : changedFiles.slice(0, visibleChangedFileCount)
  return Dom.div('ChatChanges', [
    Dom.div('ChatChangesHeader', [
      Dom.div('ChatChangesIcon', [Dom.textNode('+')]),
      Dom.div('ChatChangesSummary', [
        Dom.div('ChatChangesTitle', [
          Dom.textNode(
            `Edited ${changedFiles.length} ${changedFiles.length === 1 ? 'file' : 'files'}`,
          ),
        ]),
        Dom.div('ChatChangesMeta', [
          Dom.div('ChatChangeAdditions', [Dom.textNode(`+${additions}`)]),
          Dom.div('ChatChangeDeletions', [Dom.textNode(`-${deletions}`)]),
          ...(checksPassed > 0
            ? [
                Dom.div('ChatChecksPassed', [
                  Dom.textNode(`✓ ${checksPassed} checks passed`),
                ]),
              ]
            : []),
        ]),
      ]),
      Dom.div('ChatChangesActions', [
        Dom.button('revert', 'Undo ↩', 'ChatRevertButton'),
        Dom.button('toggle-changes', 'Review', 'ChatReviewButton', {
          ariaExpanded: state.changesExpanded,
        }),
      ]),
    ]),
    Dom.div('ChatChangedFiles', files.map(renderChangedFile)),
    ...(!state.changesExpanded && hiddenFileCount > 0
      ? [
          Dom.button(
            'toggle-changes',
            `Show ${hiddenFileCount} more ${hiddenFileCount === 1 ? 'file' : 'files'}  ⌄`,
            'ChatShowMoreButton',
          ),
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
      ...summary.messages.map((message) =>
        renderMessage(message, state.copiedMessageId),
      ),
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
