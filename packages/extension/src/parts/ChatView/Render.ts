/* eslint-disable sonarjs/no-nested-conditional, unicorn/max-nested-calls, unicorn/prefer-iterator-to-array */
import {
  mergeClassNames,
  VirtualDomElements,
  type VirtualDomNode,
} from '@lvce-editor/virtual-dom-worker'
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
const invalidMarkdownDestinationPattern = /[\s<>"']/u
const trailingPunctuation = new Set(['!', ',', '.', ':', ';', '?'])

const findNextMarkdownLink = (
  text: string,
  startIndex: number,
):
  | {
      readonly destination: string
      readonly endIndex: number
      readonly index: number
      readonly label: string
    }
  | undefined => {
  let searchIndex = startIndex
  while (searchIndex < text.length) {
    const labelEndIndex = text.indexOf('](', searchIndex)
    if (labelEndIndex === -1) {
      return undefined
    }
    const labelStartIndex = text.lastIndexOf('[', labelEndIndex)
    const destinationStartIndex = labelEndIndex + 2
    const destinationEndIndex = text.indexOf(')', destinationStartIndex)
    const label = text.slice(labelStartIndex + 1, labelEndIndex)
    const destination = text.slice(destinationStartIndex, destinationEndIndex)
    if (
      labelStartIndex >= startIndex &&
      label.length > 0 &&
      !label.includes('[') &&
      destinationEndIndex !== -1 &&
      (destination.startsWith('http://') ||
        destination.startsWith('https://')) &&
      !invalidMarkdownDestinationPattern.test(destination)
    ) {
      return {
        destination,
        endIndex: destinationEndIndex + 1,
        index: labelStartIndex,
        label,
      }
    }
    searchIndex = labelEndIndex + 2
  }
  return undefined
}

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

const renderMessageTextWithUrls = (text: string): readonly Dom.TreeNode[] => {
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

const renderMessageTextWithoutBold = (
  text: string,
): readonly Dom.TreeNode[] => {
  const children: Dom.TreeNode[] = []
  let previousIndex = 0
  let link = findNextMarkdownLink(text, previousIndex)
  while (link) {
    const matchIndex = link.index
    if (matchIndex > previousIndex) {
      children.push(
        ...renderMessageTextWithUrls(text.slice(previousIndex, matchIndex)),
      )
    }
    children.push(Dom.link(link.destination, link.label, 'ChatMessageLink'))
    previousIndex = link.endIndex
    link = findNextMarkdownLink(text, previousIndex)
  }
  if (previousIndex < text.length) {
    children.push(...renderMessageTextWithUrls(text.slice(previousIndex)))
  }
  return children
}

const boldPattern = /\*\*([\s\S]+?)\*\*/gu

type MarkdownTableRow = {
  readonly cells: readonly string[]
}

const parseMarkdownTableRow = (line: string): MarkdownTableRow | undefined => {
  const cells: string[] = []
  let cell = ''
  const trimmedLine = line.trim()
  for (let index = 0; index < trimmedLine.length; index++) {
    const char = trimmedLine[index]
    if (char === '\\' && trimmedLine[index + 1] === '|') {
      cell += '|'
      index++
    } else if (char === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell.trim())
  if (cells.length < 2) {
    return undefined
  }
  if (line.trim().startsWith('|') && cells[0] === '') {
    cells.shift()
  }
  if (line.trim().endsWith('|') && cells.at(-1) === '') {
    cells.pop()
  }
  return cells.length > 1 ? { cells } : undefined
}

const getTableAlignment = (cell: string): string => {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) {
    return 'center'
  }
  return right ? 'right' : 'left'
}

const tableDelimiterPattern = /^:?-{3,}:?$/u

type MarkdownHeading = {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  readonly text: string
}

const parseMarkdownHeading = (line: string): MarkdownHeading | undefined => {
  let markerStart = 0
  while (line[markerStart] === ' ' && markerStart < 3) {
    markerStart++
  }
  let markerEnd = markerStart
  while (line[markerEnd] === '#') {
    markerEnd++
  }
  const level = markerEnd - markerStart
  if (
    level === 0 ||
    level > 6 ||
    (markerEnd < line.length &&
      line[markerEnd] !== ' ' &&
      line[markerEnd] !== '\t')
  ) {
    return undefined
  }
  let text = line.slice(markerEnd).trim()
  let closingMarkerStart = text.length
  while (text[closingMarkerStart - 1] === '#') {
    closingMarkerStart--
  }
  if (
    closingMarkerStart < text.length &&
    (text[closingMarkerStart - 1] === ' ' ||
      text[closingMarkerStart - 1] === '\t')
  ) {
    text = text.slice(0, closingMarkerStart).trimEnd()
  }
  return {
    level: level as 1 | 2 | 3 | 4 | 5 | 6,
    text: text.trimEnd(),
  }
}

const renderMarkdownHeadingLine = (
  text: string,
  heading: MarkdownHeading,
  line: string,
  lineStart: number,
  previousOffset: number,
): {
  readonly children: readonly Dom.TreeNode[]
  readonly previousOffset: number
} => {
  const children: Dom.TreeNode[] = []
  if (lineStart > previousOffset) {
    children.push(
      ...renderMessageInlineText(text.slice(previousOffset, lineStart)),
    )
  }
  children.push(
    Dom.heading(
      heading.level,
      `ChatMessageHeading ChatMessageHeading-${heading.level}`,
      renderMessageInlineText(heading.text),
    ),
  )
  const lineEnd = lineStart + line.length
  return {
    children,
    previousOffset: lineEnd < text.length ? lineEnd + 1 : lineEnd,
  }
}

const isTableDelimiter = (cell: string): boolean =>
  tableDelimiterPattern.test(cell)

const renderTableCell = (
  cell: string,
  type: number,
  alignment: string,
): Dom.TreeNode => {
  return Dom.node(
    type,
    {
      className: mergeClassNames(
        'ChatMessageTableCell',
        `ChatMessageTableCell-${alignment}`,
      ),
      ...(type === VirtualDomElements.Th && { scope: 'col' }),
    },
    renderMessageInlineText(cell),
  )
}

const renderMarkdownTable = (
  header: MarkdownTableRow,
  rows: readonly MarkdownTableRow[],
  alignments: readonly string[],
): Dom.TreeNode => {
  const renderRow = (row: MarkdownTableRow, type: number): Dom.TreeNode =>
    Dom.node(
      VirtualDomElements.Tr,
      {},
      row.cells.map((cell, index) =>
        renderTableCell(cell, type, alignments[index]),
      ),
    )
  return Dom.div('ChatMessageTableContainer', [
    Dom.node(VirtualDomElements.Table, { className: 'ChatMessageTable' }, [
      Dom.node(VirtualDomElements.THead, {}, [
        renderRow(header, VirtualDomElements.Th),
      ]),
      Dom.node(
        VirtualDomElements.TBody,
        {},
        rows.map((row) => renderRow(row, VirtualDomElements.Td)),
      ),
    ]),
  ])
}

const jsonStringPattern = /"(?:\\.|[^"\\])*"/y
const jsonNumberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const jsonLiteralPattern = /(?:true|false|null)\b/y
const jsonKeySuffixPattern = /^\s*:/u
const languageWhitespacePattern = /\s+/u

const getFenceMarkerEnd = (
  text: string,
  lineStart: number,
  minimumLength: number,
): number | undefined => {
  let index = lineStart
  let indentation = 0
  while (text[index] === ' ' && indentation < 4) {
    index++
    indentation++
  }
  if (indentation > 3) {
    return undefined
  }
  const markerStart = index
  while (text[index] === '`') {
    index++
  }
  return index - markerStart >= minimumLength ? index : undefined
}

const isFenceLineEnd = (text: string, start: number): boolean => {
  let index = start
  while (text[index] === ' ' || text[index] === '\t') {
    index++
  }
  return index === text.length || text[index] === '\n'
}

const findClosingFence = (
  text: string,
  start: number,
  minimumLength: number,
): { readonly end: number; readonly index: number } | undefined => {
  let lineStart = start
  while (lineStart <= text.length) {
    const markerEnd = getFenceMarkerEnd(text, lineStart, minimumLength)
    if (markerEnd !== undefined && isFenceLineEnd(text, markerEnd)) {
      let end = markerEnd
      while (text[end] === ' ' || text[end] === '\t') {
        end++
      }
      return { end, index: lineStart - 1 }
    }
    const lineBreakIndex = text.indexOf('\n', lineStart)
    if (lineBreakIndex === -1) {
      return undefined
    }
    lineStart = lineBreakIndex + 1
  }
  return undefined
}

const findNextOpeningFence = (
  text: string,
  start: number,
):
  | {
      readonly contentStart: number
      readonly fenceLength: number
      readonly index: number
      readonly language: string
    }
  | undefined => {
  const previousLineBreak = text.indexOf('\n', start - 1)
  if (start > 0 && previousLineBreak === -1) {
    return undefined
  }
  let lineStart = start === 0 ? 0 : previousLineBreak + 1
  while (lineStart >= 0) {
    const lineEnd = text.indexOf('\n', lineStart)
    if (lineEnd === -1) {
      return undefined
    }
    const markerEnd = getFenceMarkerEnd(text, lineStart, 3)
    if (markerEnd !== undefined && markerEnd <= lineEnd) {
      let markerStart = lineStart
      while (text[markerStart] === ' ' && markerStart - lineStart < 3) {
        markerStart++
      }
      const fenceLength = markerEnd - markerStart
      const language = text
        .slice(markerEnd, lineEnd)
        .trim()
        .split(languageWhitespacePattern, 1)[0]
        .toLowerCase()
      return {
        contentStart: lineEnd + 1,
        fenceLength,
        index: lineStart,
        language,
      }
    }
    lineStart = lineEnd + 1
  }
  return undefined
}

const createJsonToken = (
  text: string,
  index: number,
): { readonly className: string; readonly length: number } | undefined => {
  const char = text[index]
  if (char === '"') {
    jsonStringPattern.lastIndex = index
    const match = jsonStringPattern.exec(text)
    if (match) {
      const isKey = jsonKeySuffixPattern.test(
        text.slice(index + match[0].length),
      )
      return {
        className: isKey ? 'ChatCodeTokenKey' : 'ChatCodeTokenString',
        length: match[0].length,
      }
    }
    return undefined
  }
  if ('{}[],:'.includes(char)) {
    return { className: 'ChatCodeTokenPunctuation', length: 1 }
  }
  jsonNumberPattern.lastIndex = index
  const numberMatch = jsonNumberPattern.exec(text)
  if (numberMatch) {
    return { className: 'ChatCodeTokenNumber', length: numberMatch[0].length }
  }
  jsonLiteralPattern.lastIndex = index
  const literalMatch = jsonLiteralPattern.exec(text)
  if (literalMatch) {
    return { className: 'ChatCodeTokenLiteral', length: literalMatch[0].length }
  }
  return undefined
}

const renderJsonCode = (text: string): readonly Dom.TreeNode[] => {
  const children: Dom.TreeNode[] = []
  let previousIndex = 0
  let index = 0
  while (index < text.length) {
    const token = createJsonToken(text, index)
    if (!token) {
      index++
      continue
    }
    if (index > previousIndex) {
      children.push(Dom.textNode(text.slice(previousIndex, index)))
    }
    children.push(
      Dom.node(VirtualDomElements.Span, { className: token.className }, [
        Dom.textNode(text.slice(index, index + token.length)),
      ]),
    )
    index += token.length
    previousIndex = index
  }
  if (previousIndex < text.length) {
    children.push(Dom.textNode(text.slice(previousIndex)))
  }
  return children
}

const renderCodeBlock = (text: string, language: string): Dom.TreeNode => {
  const children =
    language.toLowerCase() === 'json'
      ? renderJsonCode(text)
      : [Dom.textNode(text)]
  return Dom.node(VirtualDomElements.Pre, { className: 'ChatCodeBlock' }, [
    Dom.node(VirtualDomElements.Code, {}, children),
  ])
}

const renderMessageTextWithCode = (text: string): readonly Dom.TreeNode[] => {
  const children: Dom.TreeNode[] = []
  let previousIndex = 0
  while (previousIndex < text.length) {
    const openingFence = findNextOpeningFence(text, previousIndex)
    if (!openingFence) {
      break
    }
    const closingFence = findClosingFence(
      text,
      openingFence.contentStart,
      openingFence.fenceLength,
    )
    if (openingFence.index > previousIndex) {
      children.push(
        ...renderMessageText(text.slice(previousIndex, openingFence.index)),
      )
    }
    const blockEnd = closingFence ? closingFence.index + 1 : text.length
    children.push(
      renderCodeBlock(
        text.slice(openingFence.contentStart, blockEnd),
        openingFence.language,
      ),
    )
    previousIndex = closingFence ? closingFence.end : text.length
    if (!closingFence) {
      break
    }
  }
  if (previousIndex < text.length) {
    children.push(...renderMessageText(text.slice(previousIndex)))
  }
  return children
}

const renderMessageInlineText = (text: string): readonly Dom.TreeNode[] => {
  const children: Dom.TreeNode[] = []
  let previousIndex = 0
  for (const match of text.matchAll(boldPattern)) {
    const matchIndex = match.index
    if (matchIndex > previousIndex) {
      children.push(
        ...renderMessageTextWithoutBold(text.slice(previousIndex, matchIndex)),
      )
    }
    children.push(
      Dom.node(
        VirtualDomElements.Strong,
        {},
        renderMessageTextWithoutBold(match[1]),
      ),
    )
    previousIndex = matchIndex + match[0].length
  }
  if (previousIndex < text.length) {
    children.push(...renderMessageTextWithoutBold(text.slice(previousIndex)))
  }
  return children
}

const getMarkdownTableAtLine = (
  lines: readonly string[],
  lineStarts: readonly number[],
  lineIndex: number,
):
  | {
      readonly alignments: readonly string[]
      readonly endIndex: number
      readonly header: MarkdownTableRow
      readonly rows: readonly MarkdownTableRow[]
    }
  | undefined => {
  const header = parseMarkdownTableRow(lines[lineIndex])
  const delimiter = parseMarkdownTableRow(lines[lineIndex + 1])
  if (
    !header ||
    !delimiter ||
    delimiter.cells.length !== header.cells.length ||
    !delimiter.cells.every(isTableDelimiter)
  ) {
    return undefined
  }
  const rows: MarkdownTableRow[] = []
  let endIndex = lineIndex + 2
  for (; endIndex < lines.length; endIndex++) {
    const row = parseMarkdownTableRow(lines[endIndex])
    if (!row || row.cells.length !== header.cells.length) {
      break
    }
    rows.push(row)
  }
  if (rows.length === 0) {
    return undefined
  }
  return {
    alignments: delimiter.cells.map(getTableAlignment),
    endIndex,
    header,
    rows,
  }
}

const renderMessageText = (text: string): readonly Dom.TreeNode[] => {
  const lines = text.split('\n')
  const lineStarts: number[] = []
  let offset = 0
  for (const line of lines) {
    lineStarts.push(offset)
    offset += line.length + 1
  }
  const children: Dom.TreeNode[] = []
  let previousOffset = 0
  let lineIndex = 0
  while (lineIndex < lines.length) {
    const heading = parseMarkdownHeading(lines[lineIndex])
    if (heading) {
      const { children: headingChildren, previousOffset: nextOffset } =
        renderMarkdownHeadingLine(
          text,
          heading,
          lines[lineIndex],
          lineStarts[lineIndex],
          previousOffset,
        )
      children.push(...headingChildren)
      previousOffset = nextOffset
      lineIndex++
      continue
    }
    const table =
      lineIndex < lines.length - 1
        ? getMarkdownTableAtLine(lines, lineStarts, lineIndex)
        : undefined
    if (!table) {
      lineIndex++
      continue
    }
    if (lineStarts[lineIndex] > previousOffset) {
      children.push(
        ...renderMessageInlineText(
          text.slice(previousOffset, lineStarts[lineIndex]),
        ),
      )
    }
    children.push(
      renderMarkdownTable(table.header, table.rows, table.alignments),
    )
    const afterTableLine = lines[table.endIndex - 1]
    previousOffset = lineStarts[table.endIndex - 1] + afterTableLine.length
    if (previousOffset < text.length) {
      previousOffset++
      children.push(Dom.textNode('\n'))
    }
    lineIndex = table.endIndex
  }
  if (previousOffset < text.length) {
    children.push(...renderMessageInlineText(text.slice(previousOffset)))
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
    Dom.div('ChatMessageText', renderMessageTextWithCode(message.text)),
    ...(message.type === 'user-message' && message.attachments?.length
      ? [
          Dom.div(
            'ChatMessageImages',
            message.attachments.map((attachment) =>
              Dom.node(VirtualDomElements.Img, {
                alt: attachment.name,
                className: 'ChatMessageImage',
                src: attachment.dataUrl,
              }),
            ),
          ),
        ]
      : []),
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
    Dom.div('ChatMessageText', renderMessageTextWithCode(text)),
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
  const { modelPickerOpen, models } = state
  if (!modelPickerOpen) {
    return Dom.div('ChatModelPickerHidden', [])
  }
  return Dom.div(
    'Chat2ModelPicker',
    [
      Dom.div('ChatModelPickerTitle', [Dom.textNode('Models')], {
        name: 'model-picker-popup',
      }),
      ...models.map(renderModel),
    ],
    { name: 'model-picker-popup' },
  )
}

const getSelectedModelLabel = (state: Readonly<ChatViewState>): string => {
  const { models, selectedModelId } = state
  return (
    models.find((model) => model.id === selectedModelId)?.label ||
    'Choose model'
  )
}

const renderComposer = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const {
    composerImages,
    draft,
    modelPickerOpen,
    selectedModelId,
    selectedTask,
  } = state
  const running = isRunning(selectedTask)
  const placeholder = running
    ? 'Steer the current task'
    : selectedTask
      ? 'Ask for a follow-up change'
      : 'Describe a programming task'
  return Dom.div('ChatComposerArea', [
    renderModelPicker(state),
    Dom.form('composer', 'ChatComposer', [
      ...(composerImages.length > 0
        ? [
            Dom.div(
              'ChatComposerImages',
              composerImages.map((image) =>
                Dom.div(`ChatComposerImage ChatComposerImage-${image.status}`, [
                  ...(image.status === 'ready' && image.attachment
                    ? [
                        Dom.node(VirtualDomElements.Img, {
                          alt: image.name,
                          className: 'ChatComposerImagePreview',
                          src: image.attachment.dataUrl,
                        }),
                      ]
                    : [
                        Dom.div('ChatComposerImageStatus', [
                          Dom.textNode(
                            image.status === 'loading'
                              ? 'Loading image…'
                              : 'Could not load image',
                          ),
                        ]),
                      ]),
                  Dom.button(
                    `remove-image:${image.id}`,
                    '×',
                    'ChatComposerImageRemove',
                    { ariaLabel: `Remove ${image.name}` },
                  ),
                ]),
              ),
            ),
          ]
        : []),
      Dom.div('ChatComposerInputContainer', [
        Dom.textArea(draft, placeholder, { onPaste: 'handleImagePaste' }),
      ]),
      Dom.div('ChatComposerControls', [
        Dom.div('ChatComposerSpacer', []),
        Dom.button(
          'model-picker',
          getSelectedModelLabel(state),
          'ChatModelButton',
          { ariaExpanded: modelPickerOpen },
        ),
        running
          ? Dom.button('stop', '■', 'ChatSubmitButton', {
              ariaLabel: 'Stop task',
              title: 'Stop task',
            })
          : Dom.button('submit', '↑', 'ChatSubmitButton', {
              ariaLabel: 'Send message',
              disabled:
                (!draft.trim() && composerImages.length === 0) ||
                composerImages.some((image) => image.status !== 'ready') ||
                !selectedModelId,
              title: 'Send message',
            }),
      ]),
    ]),
  ])
}

const renderFocusModeButton = (
  state: Readonly<ChatViewState>,
): readonly Dom.TreeNode[] => {
  const { focusMode, focusModeEnabled } = state
  if (!focusModeEnabled || focusMode) {
    return []
  }
  return [
    Dom.button(
      'toggle-focus-mode',
      focusMode ? 'IDE' : 'Focus',
      'ChatFocusModeButton',
      {
        ariaLabel: focusMode
          ? 'Return to IDE layout'
          : 'Focus entirely on chat',
        title: focusMode ? 'Return to IDE layout' : 'Focus entirely on chat',
      },
    ),
  ]
}

const getRootClassName = (
  state: Readonly<ChatViewState>,
  viewClassName: string,
): string => {
  const { focusMode } = state
  return `ChatView ${viewClassName}${focusMode ? ' ChatFocusMode' : ''}`
}

const getAiNativeLayoutClassName = (
  theme: ChatViewState['aiNativeTheme'],
): string => {
  return theme === 'default'
    ? 'ChatAiNativeLayout'
    : `ChatAiNativeLayout ChatAiNativeLayoutTheme-${theme}`
}

const getAiNativeLayoutViewClassName = (
  theme: ChatViewState['aiNativeTheme'],
  sessionsVisible: boolean,
): string => {
  return `ChatView ${getAiNativeLayoutClassName(theme)}${sessionsVisible ? ' ChatSessionsVisible' : ''}`
}

const getAiNativeThemeClassName = (
  theme: ChatViewState['aiNativeTheme'],
): string => {
  return theme === 'default' ? '' : ` ChatAiNativeLayoutTheme-${theme}`
}

const renderListView = (state: Readonly<ChatViewState>): Dom.TreeNode => {
  const { errorMessage, fontFamily, fontSize, tasks } = state
  return Dom.div(
    getRootClassName(state, 'ChatListView'),
    [
      Dom.div('ChatTaskListHeader', [
        Dom.heading(1, 'ChatTitle', 'Tasks'),
        Dom.div('ChatHeaderSpacer', []),
        ...renderFocusModeButton(state),
        Dom.div('ChatTaskCount', [
          Dom.textNode(
            `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
          ),
        ]),
      ]),
      ...(errorMessage
        ? [Dom.div('ChatErrorBanner', [Dom.textNode(errorMessage)])]
        : []),
      renderTaskList(tasks, fontFamily, fontSize),
      renderComposer(state),
    ],
    {
      onClick: 'handleModelPickerOutsideClick',
      onDragOver: 'handleDragOver',
      onDrop: 'handleImageDrop',
      onKeyDown: 'handleKeyDown',
    },
  )
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
  const { activityExpanded, selectedTask: task, workingSeconds } = state
  if (!task) {
    return Dom.div('ChatActivityHidden', [])
  }
  const activities = getLatestActivities(summarizeTask(task).activities)
  if (activities.length === 0 && !isRunning(task)) {
    return Dom.div('ChatActivityHidden', [])
  }
  const label = isRunning(task)
    ? `Working for ${workingSeconds} ${workingSeconds === 1 ? 'second' : 'seconds'}`
    : `${activities.length} ${activities.length === 1 ? 'step' : 'steps'} completed`
  return Dom.div('ChatActivity', [
    Dom.button('toggle-activity', label, 'ChatActivityToggle', {
      ariaExpanded: activityExpanded,
    }),
    ...(activityExpanded
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
  const { changesExpanded, selectedTask: task } = state
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
  const files = changesExpanded
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
          ariaExpanded: changesExpanded,
        }),
      ]),
    ]),
    Dom.div('ChatChangedFiles', files.map(renderChangedFile)),
    ...(!changesExpanded && hiddenFileCount > 0
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
  const {
    copiedMessageId,
    errorMessage,
    focusMode,
    selectedTask: task,
    sessionsVisible,
  } = state
  if (!task) {
    return renderListView(state)
  }
  const summary = summarizeTask(task)
  const header = Dom.div('ChatDetailHeader', [
    Dom.button('back', 'Back', 'ChatBackButton'),
    Dom.heading(1, 'ChatDetailTitle', task.title, {
      name: 'chat-title',
      onContextMenu: 'handleContextMenu',
    }),
    ...renderFocusModeButton(state),
    Dom.button('toggle-sessions', 'Sessions', 'ChatSessionsToggleButton', {
      ariaExpanded: sessionsVisible,
    }),
    ...(focusMode ? [] : [Dom.button('new-task', 'New', 'ChatNewTaskButton')]),
  ])
  const renderedMessages = summary.messages.map((message) =>
    renderMessage(message, copiedMessageId),
  )
  const lastUserMessageIndex = summary.messages.findLastIndex(
    (message) => message.type === 'user-message',
  )
  const latestTurnContent = [
    ...renderedMessages.slice(lastUserMessageIndex),
    ...(task.streamingText ? [renderStreamingMessage(task.streamingText)] : []),
    renderActivity(state),
    ...(summary.errorMessage
      ? [Dom.div('ChatErrorBanner', [Dom.textNode(summary.errorMessage)])]
      : []),
    ...(errorMessage
      ? [Dom.div('ChatErrorBanner', [Dom.textNode(errorMessage)])]
      : []),
  ]
  const messageContent =
    focusMode && lastUserMessageIndex !== -1
      ? [
          ...renderedMessages.slice(0, lastUserMessageIndex),
          Dom.div('ChatTurnLatest', latestTurnContent),
        ]
      : [
          ...renderedMessages,
          ...(task.streamingText
            ? [renderStreamingMessage(task.streamingText)]
            : []),
          renderActivity(state),
          ...(summary.errorMessage
            ? [Dom.div('ChatErrorBanner', [Dom.textNode(summary.errorMessage)])]
            : []),
          ...(errorMessage
            ? [Dom.div('ChatErrorBanner', [Dom.textNode(errorMessage)])]
            : []),
        ]
  const changes = renderChanges(state)
  const composer = renderComposer(state)
  const messages = Dom.div('ChatMessages', [
    Dom.div('ChatMessagesContent', messageContent),
    ...(focusMode ? [changes, composer] : []),
  ])
  if (focusMode) {
    return Dom.div(
      getRootClassName(state, 'ChatDetailView'),
      [header, Dom.div('ChatConversationBody', [messages])],
      {
        onClick: 'handleModelPickerOutsideClick',
        onDragOver: 'handleDragOver',
        onDrop: 'handleImageDrop',
        onKeyDown: 'handleKeyDown',
      },
    )
  }
  return Dom.div(
    getRootClassName(state, 'ChatDetailView'),
    [header, messages, changes, composer],
    {
      onClick: 'handleModelPickerOutsideClick',
      onDragOver: 'handleDragOver',
      onDrop: 'handleImageDrop',
      onKeyDown: 'handleKeyDown',
    },
  )
}

const renderAiNativeSessions = (
  state: Readonly<ChatViewState>,
): readonly Dom.TreeNode[] => {
  const { fontFamily, fontSize, sessionsListVisible, sessionsWidth, tasks } =
    state
  if (!sessionsListVisible) {
    return []
  }
  return [
    Dom.div(
      'ChatSessions',
      [
        Dom.div('ChatTaskListHeader', [
          Dom.heading(1, 'ChatTitle', 'Sessions'),
          Dom.button('new-task', 'New chat', 'ChatNewTaskButton'),
        ]),
        renderTaskList(tasks, fontFamily, fontSize),
      ],
      {
        ...(sessionsWidth !== undefined && {
          style: `--ChatSessionsWidth: ${sessionsWidth}px`,
        }),
      },
    ),
    Dom.node(VirtualDomElements.Div, {
      ariaLabel: 'Resize sessions panel',
      ariaOrientation: 'vertical',
      className: 'ChatSessionsSash',
      name: 'sessions-sash',
      onPointerDown: 'handleSessionsSashPointerDown',
      role: 'separator',
      tabIndex: -1,
    }),
  ]
}

export const render = (
  state: Readonly<ChatViewState>,
): readonly VirtualDomNode[] => {
  const {
    aiNativeTheme,
    errorMessage,
    focusMode,
    loginPending,
    loginRequired,
    selectedTask,
    sessionsVisible,
  } = state
  if (loginRequired) {
    return Dom.flatten(
      Dom.div(
        `${getRootClassName(state, 'ChatLoggedOut')}${focusMode ? getAiNativeThemeClassName(aiNativeTheme) : ''}`,
        [
          ...renderFocusModeButton(state),
          Dom.node(
            VirtualDomElements.P,
            { className: 'ChatLoginDescription' },
            [
              Dom.textNode(
                'Log in to Chat 2 to get help with programming tasks, make changes in your workspace, and verify the results.',
              ),
            ],
          ),
          Dom.button('login', 'Login', 'ChatLoginButton', {
            disabled: loginPending,
          }),
          ...(errorMessage && !loginPending
            ? [Dom.div('ChatError', [Dom.textNode(errorMessage)])]
            : []),
        ],
        {
          onClick: 'handleModelPickerOutsideClick',
          onDragOver: 'handleDragOver',
          onDrop: 'handleImageDrop',
        },
      ),
    )
  }
  if (focusMode) {
    const conversation = selectedTask
      ? renderDetailView(state)
      : Dom.div(
          'ChatView ChatDetailView',
          [
            Dom.div('ChatDetailHeader', [
              Dom.heading(1, 'ChatTitle', 'Chat'),
              Dom.button(
                'toggle-sessions',
                'Sessions',
                'ChatSessionsToggleButton',
                {
                  ariaExpanded: sessionsVisible,
                },
              ),
              ...renderFocusModeButton(state),
            ]),
            Dom.div('ChatConversationBody', [
              Dom.div('ChatMessages', [
                Dom.div('ChatMessagesContent', [
                  Dom.heading(
                    2,
                    'ChatEmptyTitle',
                    'What would you like to work on?',
                  ),
                  ...(errorMessage
                    ? [Dom.div('ChatErrorBanner', [Dom.textNode(errorMessage)])]
                    : []),
                ]),
                renderChanges(state),
                renderComposer(state),
              ]),
            ]),
          ],
          {
            onClick: 'handleModelPickerOutsideClick',
            onDragOver: 'handleDragOver',
            onDrop: 'handleImageDrop',
            onKeyDown: 'handleKeyDown',
          },
        )
    return Dom.flatten(
      Dom.div(
        getAiNativeLayoutViewClassName(aiNativeTheme, sessionsVisible),
        [...renderAiNativeSessions(state), conversation],
        {
          onClick: 'handleModelPickerOutsideClick',
          onDragOver: 'handleDragOver',
          onDrop: 'handleImageDrop',
          onKeyDown: 'handleKeyDown',
        },
      ),
    )
  }
  return Dom.flatten(
    selectedTask ? renderDetailView(state) : renderListView(state),
  )
}
