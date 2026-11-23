import { build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { root } from './root.ts'

const require = createRequire(import.meta.url)
const katex = dirname(require.resolve('katex/package.json'))
const cssWorker = join(
  root,
  'packages',
  'extension',
  'src',
  'chatMathCssWorkerMain.ts',
)

export const buildMathAssets = async (extensionDir: string): Promise<void> => {
  const media = join(extensionDir, 'media', 'katex')
  await rm(media, { recursive: true, force: true })
  await mkdir(media, { recursive: true })
  await cp(join(katex, 'dist', 'fonts'), join(media, 'fonts'), {
    recursive: true,
  })
  await cp(join(katex, 'LICENSE'), join(media, 'LICENSE'))

  await build({
    bundle: true,
    entryPoints: [cssWorker],
    external: ['electron', 'node:*'],
    format: 'esm',
    loader: { '.css': 'text' },
    outfile: join(extensionDir, 'dist', 'chatMathCssWorkerMain.js'),
    platform: 'browser',
    target: 'esnext',
  })
}
