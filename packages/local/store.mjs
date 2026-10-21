import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const store = resolve(process.env.CIVIC_LOCAL_STORE ?? process.env.CIVIC_STORE ?? join(repo, '.civic-canvas'))
