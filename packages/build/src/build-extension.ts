import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { root } from './root.ts'

const extension = path.join(root, 'packages', 'extension')
const entryPoint = path.join(extension, 'src', 'chatMain.ts')
const workerEntryPoint = path.join(
  extension,
  'src',
  'typeScriptEvaluationWorkerMain.ts',
)
const chatToolWorkerEntryPoint = path.join(
  root,
  'packages',
  'chat-tool-worker',
  'src',
  'chatToolWorkerMain.ts',
)
const outdir = path.join(extension, 'dist')

fs.rmSync(outdir, { recursive: true, force: true })
fs.mkdirSync(outdir, { recursive: true })

await esbuild.build({
  bundle: true,
  entryPoints: [entryPoint],
  external: ['electron', 'node:*'],
  format: 'esm',
  outfile: path.join(outdir, 'chatMain.js'),
  platform: 'browser',
  sourcemap: true,
  target: 'esnext',
})

await esbuild.build({
  bundle: true,
  entryPoints: [chatToolWorkerEntryPoint],
  external: ['electron', 'node:*'],
  format: 'esm',
  outfile: path.join(outdir, 'chatToolWorkerMain.js'),
  platform: 'browser',
  target: 'esnext',
})

await esbuild.build({
  bundle: true,
  entryPoints: [workerEntryPoint],
  external: ['electron', 'node:*'],
  format: 'esm',
  outfile: path.join(outdir, 'typeScriptEvaluationWorkerMain.js'),
  platform: 'browser',
  target: 'esnext',
})
