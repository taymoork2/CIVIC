import { globSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

for (const file of globSync(['*.mjs', '*.cjs'], { cwd: process.argv[2] })) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', cwd: process.argv[2] })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
