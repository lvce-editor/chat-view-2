import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../dist/dist/', import.meta.url))
const bundleBudget = 300_000
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
if (files.length !== 1 || basename(files[0]) !== 'chatMain.js') {
  throw new Error(
    `Expected one JavaScript bundle named chatMain.js, found: ${files.join(', ')}`,
  )
}
const sizes = await Promise.all(
  files.map(async (file) => ({ file, size: (await stat(file)).size })),
)
const [bundle] = sizes
const bundleSource = await readFile(bundle.file, 'utf8')
if (dynamicImportRegex.test(bundleSource)) {
  throw new Error('Chat 2 bundle contains a dynamic import')
}
if (bundle.size > bundleBudget) {
  throw new Error(
    `Chat 2 bundle is ${bundle.size} bytes; budget is ${bundleBudget}`,
  )
}
console.log(`Chat 2 bundle checks passed: size=${bundle.size}`)
