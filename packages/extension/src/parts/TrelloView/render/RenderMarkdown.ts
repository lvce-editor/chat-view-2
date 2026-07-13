import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
import * as Dom from '../../VirtualDom/VirtualDom.ts'

const headingTypes = [
  VirtualDomElements.H1,
  VirtualDomElements.H2,
  VirtualDomElements.H3,
  VirtualDomElements.H4,
  VirtualDomElements.H5,
  VirtualDomElements.H6,
] as const

const escapedMarkdownTextPattern = /\\([\\`*_{}()[\]#+\-.!])/g

const allowedLinkProtocols = ['http:', 'https:', 'mailto:']

interface InlineMatch {
  readonly end: number
  readonly node: Dom.TreeNode
  readonly start: number
}

const sanitizeHref = (href: string): string => {
  try {
    const url = new URL(href)
    if (allowedLinkProtocols.includes(url.protocol)) {
      return href
    }
  } catch {
    return ''
  }
  return ''
}

const findDelimited = (
  text: string,
  delimiter: string,
  type: number,
  className: string,
): InlineMatch | undefined => {
  const start = text.indexOf(delimiter)
  if (start === -1) {
    return undefined
  }
  const end = text.indexOf(delimiter, start + delimiter.length)
  if (end === -1) {
    return undefined
  }
  const value = text.slice(start + delimiter.length, end)
  return {
    end: end + delimiter.length,
    node: Dom.node(type, { className }, parseInline(value)),
    start,
  }
}

const findInlineCode = (text: string): InlineMatch | undefined => {
  const start = text.indexOf('`')
  if (start === -1) {
    return undefined
  }
  const end = text.indexOf('`', start + 1)
  if (end === -1) {
    return undefined
  }
  return {
    end: end + 1,
    node: Dom.node(
      VirtualDomElements.Code,
      { className: 'TrelloMarkdownCode' },
      [Dom.textNode(text.slice(start + 1, end))],
    ),
    start,
  }
}

const findItalic = (text: string): InlineMatch | undefined => {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '*' || text[i + 1] === '*' || text[i - 1] === '*') {
      continue
    }
    const end = text.indexOf('*', i + 1)
    if (end === -1 || text[end + 1] === '*') {
      return undefined
    }
    return {
      end: end + 1,
      node: Dom.node(
        VirtualDomElements.Em,
        { className: 'TrelloMarkdownEmphasis' },
        parseInline(text.slice(i + 1, end)),
      ),
      start: i,
    }
  }
  return undefined
}

const findLink = (text: string): InlineMatch | undefined => {
  let start = text.indexOf('[')
  while (start !== -1) {
    const labelEnd = text.indexOf(']', start + 1)
    if (labelEnd === -1) {
      return undefined
    }
    if (text[labelEnd + 1] !== '(') {
      start = text.indexOf('[', start + 1)
      continue
    }
    const hrefStart = labelEnd + 2
    const hrefEnd = text.indexOf(')', hrefStart)
    if (hrefEnd === -1) {
      return undefined
    }
    const label = text.slice(start + 1, labelEnd)
    const hrefText = text.slice(hrefStart, hrefEnd)
    if (!label || !hrefText || hrefText.includes(' ')) {
      start = text.indexOf('[', start + 1)
      continue
    }
    const href = sanitizeHref(hrefText)
    const children = parseInline(label)
    if (!href) {
      return {
        end: hrefEnd + 1,
        node: Dom.node(VirtualDomElements.Span, {}, children),
        start,
      }
    }
    return {
      end: hrefEnd + 1,
      node: Dom.node(
        VirtualDomElements.A,
        {
          className: 'TrelloMarkdownLink',
          href,
          target: '_blank',
        },
        children,
      ),
      start,
    }
  }
  return undefined
}

const getFirstInlineMatch = (text: string): InlineMatch | undefined => {
  const matches = [
    findInlineCode(text),
    findLink(text),
    findDelimited(
      text,
      '**',
      VirtualDomElements.Strong,
      'TrelloMarkdownStrong',
    ),
    findItalic(text),
  ].filter((match): match is InlineMatch => Boolean(match))
  let first: InlineMatch | undefined
  for (const match of matches) {
    if (!first || match.start < first.start) {
      first = match
    }
  }
  return first
}

const unescapeMarkdownText = (text: string): string => {
  return text.replaceAll(escapedMarkdownTextPattern, '$1')
}

const parseInline = (text: string): readonly Dom.TreeNode[] => {
  if (!text) {
    return []
  }
  const match = getFirstInlineMatch(text)
  if (!match) {
    return [Dom.textNode(unescapeMarkdownText(text))]
  }
  return [
    ...parseInline(text.slice(0, match.start)),
    match.node,
    ...parseInline(text.slice(match.end)),
  ]
}

const renderInlineLines = (
  lines: readonly string[],
): readonly Dom.TreeNode[] => {
  return lines.flatMap((line, index) => {
    if (index === 0) {
      return parseInline(line)
    }
    return [Dom.node(VirtualDomElements.Br), ...parseInline(line)]
  })
}

const isHeading = (line: string): boolean => {
  const level = getHeadingLevel(line)
  return level > 0 && line.slice(level).trim().length > 0
}

const isListItem = (line: string): boolean => {
  const value = line.trimStart()
  return (
    (value.startsWith('- ') || value.startsWith('* ')) &&
    value.slice(2).trim().length > 0
  )
}

const getHeadingLevel = (line: string): number => {
  let level = 0
  while (level < line.length && level < 6 && line[level] === '#') {
    level++
  }
  if (level === 0 || line[level] !== ' ') {
    return 0
  }
  return level
}

const renderHeading = (line: string): Dom.TreeNode => {
  const level = getHeadingLevel(line)
  if (level === 0) {
    return renderParagraph([line])
  }
  return Dom.node(
    headingTypes[level - 1],
    {
      className: `TrelloMarkdownHeading TrelloMarkdownHeading${level}`,
    },
    parseInline(line.slice(level + 1)),
  )
}

const renderListItem = (line: string): Dom.TreeNode => {
  return Dom.node(
    VirtualDomElements.Li,
    { className: 'TrelloMarkdownListItem' },
    parseInline(line.trimStart().slice(2)),
  )
}

const renderParagraph = (lines: readonly string[]): Dom.TreeNode => {
  return Dom.node(
    VirtualDomElements.P,
    { className: 'TrelloMarkdownParagraph' },
    renderInlineLines(lines),
  )
}

export const renderMarkdown = (markdown: string): readonly Dom.TreeNode[] => {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const nodes: Dom.TreeNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }
    if (isHeading(line)) {
      nodes.push(renderHeading(line))
      continue
    }
    if (isListItem(line)) {
      const items: Dom.TreeNode[] = []
      while (i < lines.length && isListItem(lines[i])) {
        items.push(renderListItem(lines[i]))
        i++
      }
      i--
      nodes.push(
        Dom.node(
          VirtualDomElements.Ul,
          { className: 'TrelloMarkdownList' },
          items,
        ),
      )
      continue
    }
    const paragraphLines = [line]
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !isHeading(lines[i + 1]) &&
      !isListItem(lines[i + 1])
    ) {
      i++
      paragraphLines.push(lines[i])
    }
    nodes.push(renderParagraph(paragraphLines))
  }
  return nodes
}
