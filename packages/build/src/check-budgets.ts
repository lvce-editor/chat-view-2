import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { root } from './root.ts'

const outputDirectory = join(root, 'dist', 'dist')
const bundleBudgets = new Map([
  // Same Node 26.12.1 build and lockfile: recorded Trello OAuth baseline
  // 344,635 bytes, board selection 347,439 (+2,804 / 0.81%).
  // Keep 1,561 bytes of headroom while retaining the bundle size gate.
  ['chatMain.js', 349_000],
  ['chatMathCssWorkerMain.js', 80_000],
  ['chatMathWorkerMain.js', 750_000],
  ['chatToolWorkerMain.js', 100_000],
  ['commandProcessMain.js', 200_000],
  ['typeScriptEvaluationWorkerMain.js', 6_000_000],
])
const dynamicImportRegex = /\bimport\s*\(/

const visit = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await visit(path)))
    } else if (entry.name.endsWith('.js')) {
      files.push(path)
    }
  }
  return files
}

const files = await visit(outputDirectory)
const expectedFiles = [...bundleBudgets.keys()].sort()
const actualFiles = files.map((file) => basename(file)).sort()
if (
  actualFiles.length !== expectedFiles.length ||
  actualFiles.some((file, index) => file !== expectedFiles[index])
) {
  throw new Error(
    `Expected JavaScript bundles named ${expectedFiles.join(', ')}, found: ${files.join(', ')}`,
  )
}
const sizes = await Promise.all(
  files.map(async (file) => ({ file, size: (await stat(file)).size })),
)
for (const bundle of sizes) {
  const bundleName = basename(bundle.file)
  const bundleSource = await readFile(bundle.file, 'utf8')
  // Babel Standalone contains import() examples as parser/template strings; only
  // the extension entry bundle must be free of runtime dynamic imports.
  if (bundleName === 'chatMain.js' && dynamicImportRegex.test(bundleSource)) {
    throw new Error(`${bundleName} contains a dynamic import`)
  }
  const budget = bundleBudgets.get(bundleName)
  if (budget === undefined || bundle.size > budget) {
    throw new Error(
      `${bundleName} is ${bundle.size} bytes; budget is ${budget ?? 'undefined'}`,
    )
  }
  console.log(`${bundleName} checks passed: size=${bundle.size}`)
}
