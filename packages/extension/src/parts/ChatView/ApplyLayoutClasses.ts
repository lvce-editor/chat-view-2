import {
  mergeClassNames,
  type VirtualDomNode,
} from '@lvce-editor/virtual-dom-worker'
import type { ChatViewState } from './ChatViewState.ts'
import { summarizeTask } from '../ChatTask/ChatTask.ts'

// Layout classes depend on view state, so moving a component within the tree
// does not change its styling. Keep the IDE view's base classes unchanged.
export const applyLayoutClasses = (
  state: Readonly<ChatViewState>,
  dom: readonly VirtualDomNode[],
): readonly VirtualDomNode[] => {
  const { focusMode } = state
  if (!focusMode) {
    return dom
  }
  const { aiNativeTheme, selectedTask, sessionsVisible } = state
  const active = !!selectedTask
  const hasChanges =
    !!selectedTask && summarizeTask(selectedTask).changedFiles.length > 0
  const classes: Readonly<Record<string, string>> = {
    ChatBackButton: 'ChatBackButtonAiNative',
    ChatChanges: active ? 'ChatChangesActive ChatComposerFade' : '',
    ChatComposer: 'ChatComposerFocus',
    ChatComposerArea: `ChatComposerAreaAiNative${active ? ' ChatComposerAreaActive' : ''}${active && !hasChanges ? ' ChatComposerFade' : ''}`,
    ChatConversationBody: `ChatConversationBodyAiNative${active ? '' : ' ChatConversationBodyEmpty'}`,
    ChatDetailHeader: 'ChatDetailHeaderAiNative ChatDetailHeaderFocus',
    ChatDetailView: 'ChatDetailViewAiNative',
    ChatEmptyText: aiNativeTheme === 'claude' ? 'ChatTextTheme-claude' : '',
    ChatEmptyTitle: aiNativeTheme === 'claude' ? 'ChatTextTheme-claude' : '',
    ChatMessage: 'ChatMessageAiNative',
    ChatMessages: `ChatMessagesAiNative ${active ? 'ChatMessagesActive' : 'ChatMessagesEmpty'}`,
    ChatMessagesContent: `ChatMessagesContentAiNative${active ? ' ChatMessagesContentActive' : ''}${aiNativeTheme === 'claude' ? ' ChatTextTheme-claude' : ''}`,
    ChatSessions: sessionsVisible ? 'ChatSessionsOverlay' : '',
    ChatSessionsToggleButton: 'ChatSessionsToggleButtonFocus',
    ChatTurnLatest: 'ChatTurnLatestAiNative',
    ChatView: `ChatTheme-${aiNativeTheme}`,
  }
  return dom.map((node) => {
    if (typeof node.className !== 'string') {
      return node
    }
    const additions = node.className
      .split(' ')
      .map((className) => classes[className])
      .filter(Boolean)
    return additions.length > 0
      ? { ...node, className: mergeClassNames(node.className, ...additions) }
      : node
  })
}
