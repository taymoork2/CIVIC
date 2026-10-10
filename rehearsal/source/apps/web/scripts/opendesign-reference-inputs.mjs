import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export async function referenceInputHashes(webRoot) {
  async function files(directory) {
    const entries = await readdir(join(webRoot, directory), { withFileTypes: true })
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat()
  }
  const paths = [...await files('src'), ...await files('public'), ...await files('../../packages/planner/src'), 'package.json', '../../pnpm-lock.yaml'].sort()
  return Object.fromEntries(await Promise.all(paths.map(async (file) => [file, createHash('sha256').update(await readFile(join(webRoot, file))).digest('hex')])))
}
