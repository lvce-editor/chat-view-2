/* eslint-disable unicorn/no-top-level-side-effects */
export { activate, deactivate } from './parts/Main/Main.ts'
import { activate } from './parts/Main/Main.ts'

const main = async (): Promise<void> => {
  await activate()
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- Start activation without blocking module evaluation.
main()
