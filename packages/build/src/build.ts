import { packageExtension } from '@lvce-editor/package-extension'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path, { join } from 'node:path'
import { type Plugin, rollup } from 'rollup'
import { build as esbuildBuild } from 'esbuild'
import esbuild from 'rollup-plugin-esbuild'
import { root } from './root.ts'

const extension = path.join(root, 'packages', 'extension')
const node = path.join(root, 'packages', 'node')
const require = createRequire(import.meta.url)
const commonjs = require('@rollup/plugin-commonjs') as () => Plugin
const json = require('@rollup/plugin-json') as () => Plugin

fs.rmSync(join(root, 'dist'), { recursive: true, force: true })

fs.mkdirSync(path.join(root, 'dist'))

fs.copyFileSync(join(root, 'README.md'), join(root, 'dist', 'README.md'))
fs.copyFileSync(
  join(extension, 'extension.json'),
  join(root, 'dist', 'extension.json'),
)
fs.copyFileSync(join(extension, 'chat.css'), join(root, 'dist', 'chat.css'))
fs.copyFileSync(join(extension, 'chat.svg'), join(root, 'dist', 'chat.svg'))
fs.cpSync(node, join(root, 'dist', 'node'), {
  recursive: true,
  verbatimSymlinks: true,
})
const computerUsePackage = join(
  root,
  'node_modules',
  '@agent-sh',
  'computer-use-linux',
)
if (fs.existsSync(computerUsePackage)) {
  fs.mkdirSync(join(root, 'dist', 'node', 'node_modules', '@agent-sh'), {
    recursive: true,
  })
  fs.cpSync(
    computerUsePackage,
    join(
      root,
      'dist',
      'node',
      'node_modules',
      '@agent-sh',
      'computer-use-linux',
    ),
    { recursive: true, verbatimSymlinks: true },
  )
}

fs.rmSync(join(root, 'dist', 'node', 'node_modules', '.bin'), {
  recursive: true,
  force: true,
})
for (const devDependency of ['@types', 'undici-types']) {
  fs.rmSync(join(root, 'dist', 'node', 'node_modules', devDependency), {
    recursive: true,
    force: true,
  })
}

const bundle = await rollup({
  input: join(extension, 'src', 'chatMain.ts'),
  external: ['electron', 'node:*'],
  plugins: [
    json(),
    nodeResolve({
      browser: true,
    }),
    commonjs(),
    esbuild({
      target: 'esnext',
    }),
  ],
  treeshake: {
    moduleSideEffects: false,
  },
})

await bundle.write({
  file: join(root, 'dist', 'dist', 'chatMain.js'),
  format: 'esm',
  inlineDynamicImports: true,
})

await bundle.close()

await esbuildBuild({
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  bundle: true,
  entryPoints: [join(node, 'src', 'computerUseProcess.js')],
  external: ['electron', 'node:*', './computerUseClient.js'],
  format: 'esm',
  outfile: join(root, 'dist', 'node', 'src', 'computerUseProcess.js'),
  platform: 'node',
  target: 'node24',
})

await packageExtension({
  highestCompression: true,
  inDir: join(root, 'dist'),
  outFile: join(root, 'extension.tar.br'),
})
