export interface MathExpression {
  readonly displayMode: boolean
  readonly source: string
}

export interface MathToken extends MathExpression {
  readonly end: number
  readonly start: number
  readonly text: string
}

const codePattern = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`/gu
const expressionPattern =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$(\S(?:[^$\n]*?\S)?)\$/gu

export const getMathTokens = (text: string): readonly MathToken[] => {
  const expressions: MathToken[] = []
  let previousOffset = 0
  for (const codeMatch of text.matchAll(codePattern)) {
    const codeStart = codeMatch.index
    const codeEnd = codeStart + codeMatch[0].length
    expressions.push(
      ...getMathTokensInText(
        text.slice(previousOffset, codeStart),
        previousOffset,
      ),
    )
    previousOffset = codeEnd
  }
  expressions.push(
    ...getMathTokensInText(text.slice(previousOffset), previousOffset),
  )
  return expressions
}

export const getMathExpressions = (text: string): readonly MathExpression[] =>
  getMathTokens(text).map(({ displayMode, source }) => ({
    displayMode,
    source,
  }))

const getMathTokensInText = (
  text: string,
  offset: number,
): readonly MathToken[] => {
  const expressions: MathToken[] = []
  for (const match of text.matchAll(expressionPattern)) {
    const source = match[1] ?? match[2] ?? match[3] ?? match[4]
    if (!source?.trim()) {
      continue
    }
    expressions.push({
      displayMode: Boolean(match[1] || match[2]),
      end: offset + match.index + match[0].length,
      source,
      start: offset + match.index,
      text: match[0],
    })
  }
  return expressions
}
