/* eslint-disable unicorn/no-top-level-side-effects */
export { activate, deactivate } from './parts/Main/Main.ts'
import { setExtensionRuntimeFromModuleUrl } from './parts/ExtensionRuntime/ExtensionRuntime.ts'
import { activate } from './parts/Main/Main.ts'

setExtensionRuntimeFromModuleUrl(import.meta.url)
await activate()
