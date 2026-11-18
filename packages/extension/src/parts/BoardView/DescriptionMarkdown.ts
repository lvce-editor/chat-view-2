import { VirtualDomElements } from '@lvce-editor/virtual-dom-worker'
import * as Dom from '../VirtualDom/VirtualDom.ts'

const safeUrl = (value: string): string | undefined => {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)
  return url.protocol === 'https:' || url.protocol === 'http:'
    ? url.href
    : undefined
}

type InlineToken = {
  readonly endIndex: number
  readonly node: Dom.Node
}

const parseLinkToken = (
  text: string,
  index: number,
): InlineToken | undefined => {
  const image = text.startsWith('![', index)
  if (!image && !text.startsWith('[', index)) return undefined
  const labelStart = index + (image ? 2 : 1)
  const labelEnd = text.indexOf('](', labelStart)
  if (labelEnd <= labelStart) return undefined
  const destinationStart = labelEnd + 2
  const destinationEnd = text.indexOf(')', destinationStart)
  if (destinationEnd <= destinationStart) return undefined
  const destination = text.slice(destinationStart, destinationEnd)
  const url = safeUrl(destination)
  if (!url || destination.includes(' ')) return undefined
  const label = text.slice(labelStart, labelEnd)
  const node = image
    ? Dom.node(VirtualDomElements.Img, {
        alt: label,
        className: 'BoardDescriptionImage',
        loading: 'lazy',
        src: url,
      })
    : Dom.link(url, label, 'BoardDescriptionLink')
  return { endIndex: destinationEnd + 1, node }
}

const parseFormattedToken = (
  text: string,
  index: number,
): InlineToken | undefined => {
  const bold = text.startsWith('**', index)
  let marker = ''
  if (bold) {
    marker = '**'
  } else if (text[index] === '`') {
    marker = '`'
  }
  if (!marker) return undefined
  const contentStart = index + marker.length
  const endIndex = text.indexOf(marker, contentStart)
  if (endIndex <= contentStart) return undefined
  const type = bold ? VirtualDomElements.Strong : VirtualDomElements.Code
  return {
    endIndex: endIndex + marker.length,
    node: Dom.node(type, {}, [
      Dom.textNode(text.slice(contentStart, endIndex)),
    ]),
  }
}

const renderInline = (text: string): readonly Dom.Node[] => {
  const children: Dom.Node[] = []
  let textStart = 0
  let index = 0
  while (index < text.length) {
    const token =
      parseLinkToken(text, index) || parseFormattedToken(text, index)
    if (!token) {
      index++
      continue
    }
    if (index > textStart) {
      children.push(Dom.textNode(text.slice(textStart, index)))
    }
    children.push(token.node)
    index = token.endIndex
    textStart = index
  }
  if (textStart < text.length) {
    children.push(Dom.textNode(text.slice(textStart)))
  }
  return children
}

const parseHeading = (
  line: string,
): { readonly level: number; readonly text: string } | undefined => {
  let level = 0
  while (line[level] === '#' && level < 6) level++
  if (level === 0 || line[level] !== ' ') return undefined
  const text = line.slice(level).trim()
  return text ? { level, text } : undefined
}

const parseListItem = (line: string): string | undefined => {
  if (
    (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('+ ')) &&
    line.length > 2
  ) {
    return line.slice(2)
  }
  return undefined
}

export const renderDescriptionMarkdown = (text: string): Dom.Node => {
  const blocks: Dom.Node[] = []
  let paragraph: string[] = []
  let list: string[] = []
  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push(
      Dom.node(
        VirtualDomElements.P,
        {},
        paragraph.flatMap((line, index) => [
          ...(index ? [Dom.textNode('\n')] : []),
          ...renderInline(line),
        ]),
      ),
    )
    paragraph = []
  }
  const flushList = (): void => {
    if (list.length === 0) return
    blocks.push(
      Dom.node(
        VirtualDomElements.Ul,
        {},
        list.map((item) =>
          Dom.node(VirtualDomElements.Li, {}, renderInline(item)),
        ),
      ),
    )
    list = []
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const heading = parseHeading(trimmed)
    const item = parseListItem(trimmed)
    if (!trimmed) {
      flushParagraph()
      flushList()
    } else if (heading) {
      flushParagraph()
      flushList()
      blocks.push(
        Dom.heading(
          heading.level as 1 | 2 | 3 | 4 | 5 | 6,
          'BoardDescriptionHeading',
          renderInline(heading.text),
        ),
      )
    } else if (item) {
      flushParagraph()
      list.push(item)
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return Dom.div('BoardDescriptionMarkdown', blocks)
}
