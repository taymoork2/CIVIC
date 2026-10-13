import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runtimeService as civicRuntime } from '@civic/canvas/runtime'

const web = dirname(dirname(fileURLToPath(import.meta.url)))

async function moduleFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.filter((entry) => entry.name !== 'node_modules').map((entry) => entry.isDirectory() ? moduleFiles(join(root, entry.name)) : join(root, entry.name)))).flat()
}

/** Laundry's isolated runs: CIVIC's run service with its Convex functions indexed for convex-test. */
export function runtimeService(project, source, { dataDir } = {}) {
  return civicRuntime(project, source, {
    dataDir,
    root: web,
    aliases: { 'convex-test': join(web, '../../convex/node_modules/convex-test/dist/index.js') },
    async modules() {
      const files = project.aliases['@convex'] ? (await moduleFiles(join(project.root, 'convex'))).filter((path) => path.endsWith('.ts') && !/\.(?:test|testing|spec)\.ts$/.test(path)) : []
      return { 'virtual:rehearsal-backend': `export const modules = {${files.map((path) => `${JSON.stringify(path)}: () => import(${JSON.stringify(path)})`).join(',')}}` }
    },
  })
}
