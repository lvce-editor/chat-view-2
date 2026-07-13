import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../dist/dist/', import.meta.url))
const entryBudget = 150_000
const totalBudget = 300_000
const staticImportRegex = /from ['"]\.\/(.+)['"]/

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
const sizes = await Promise.all(
  files.map(async (file) => ({ file, size: (await stat(file)).size })),
)
const entry = sizes.find(({ file }) => basename(file) === 'chatMain.js')
if (!entry) {
  throw new Error('Could not find dist/dist/chatMain.js')
}
const total = sizes.reduce((sum, item) => sum + item.size, 0)
const entrySource = await readFile(entry.file, 'utf8')
const staticImport = staticImportRegex.exec(entrySource)?.[1]
const staticChunk = staticImport
  ? sizes.find(({ file }) => file.replaceAll('\\', '/').endsWith(staticImport))
  : undefined
const initial = entry.size + (staticChunk?.size || 0)
if (initial > entryBudget) {
  throw new Error(
    `Initial Chat 2 bundle is ${initial} bytes; budget is ${entryBudget}`,
  )
}
if (total > totalBudget) {
  throw new Error(
    `Chat 2 JavaScript is ${total} bytes; budget is ${totalBudget}`,
  )
}
console.log(`Chat 2 bundle budgets passed: initial=${initial}, total=${total}`)
