import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const valid = value => ['system', 'light', 'dark'].includes(value)
export function readAppearance(file) {
  try {
    const { theme } = JSON.parse(readFileSync(file, 'utf8'))
    return valid(theme) ? theme : 'system'
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) console.warn('Appearance preference unavailable:', error.message)
    return 'system'
  }
}

export function saveAppearance(file, theme) {
  if (!valid(theme)) throw Error('Invalid appearance preference')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify({ theme }), { mode: 0o600 })
  renameSync(file + '.tmp', file)
}
