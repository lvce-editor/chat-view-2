import { cp, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { root } from './root.ts'

await import('./build-static.ts')

const source = path.join(root, 'dist2')
const target = path.join(
  homedir(),
  '.local',
  'share',
  'lvce',
  'extensions',
  'trello',
)

await rm(target, { recursive: true, force: true })
await cp(source, target, {
  recursive: true,
  force: true,
})
