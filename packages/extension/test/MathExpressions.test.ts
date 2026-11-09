import { expect, test } from '@jest/globals'
import { getMathExpressions } from '../src/parts/ChatView/MathExpressions.ts'

test('finds inline and display math expressions', () => {
  expect(
    getMathExpressions(
      'The prime is \\(2^{136,279,841}-1\\).\n$$x^2 + y^2$$\n\\[a+b\\]',
    ),
  ).toEqual([
    { displayMode: false, source: '2^{136,279,841}-1' },
    { displayMode: true, source: 'x^2 + y^2' },
    { displayMode: true, source: 'a+b' },
  ])
})

test('does not interpret code or incomplete expressions as math', () => {
  expect(
    getMathExpressions('`$x$`\n```tex\n$x^2$\n```\nStreaming $x^2'),
  ).toEqual([])
})

test('supports dollar delimiters without interpreting escaped currency', () => {
  expect(getMathExpressions('Cost: $5. $x+1$ and $$x^2$$')).toEqual([
    { displayMode: false, source: 'x+1' },
    { displayMode: true, source: 'x^2' },
  ])
})
