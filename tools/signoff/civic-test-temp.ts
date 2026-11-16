import { mkdtempSync, realpathSync, mkdirSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

// The copied tests spawn fresh Node processes; expose CIVIC's installed TypeScript there too.
const modules = path.join(import.meta.dirname, 'node_modules')
mkdirSync(modules, { recursive: true })
if (!existsSync(path.join(modules, 'typescript'))) symlinkSync(path.dirname(createRequire(path.resolve(import.meta.dirname, '../../packages/canvas/package.json')).resolve('typescript/package.json')), path.join(modules, 'typescript'))

export function ownedTemp(prefix: string) {
  if (!process.env.CIVIC_TEMP_ROOT || realpathSync(tmpdir()) !== realpathSync(process.env.CIVIC_TEMP_ROOT)) throw new Error('Run package tests through bin/with-temp-root.mjs')
  if (!/^[a-zA-Z0-9_-]+$/u.test(prefix)) throw new Error('Invalid temporary-directory prefix')
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  // CIVIC's wrapper owns cleanup, including failure and signal paths.
  return { directory, cleanup() {} }
}
