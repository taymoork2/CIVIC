import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function readBackendCoverage(cwd: string, manifest = '.', store = '.', dataDir?: string) {
  const moduleAt = (path: string) => new URL(path, import.meta.url).href
  const { loadProject } = await import(moduleAt('../../packages/vite-connector/src/review-project.mjs'))
  const { reviewInventory } = await import(moduleAt('../../packages/vite-connector/src/review-inventory.mjs'))
  const { projectBackendCoverage } = await import(moduleAt('../../packages/canvas/server/backend-coverage.mjs'))
  const hostStore = resolve(cwd, store)
  const project = loadProject(hostStore, { manifest: resolve(cwd, manifest) })
  const inventory = await reviewInventory(hostStore, undefined, undefined, project, { engineRoots: [fileURLToPath(new URL('../../packages/canvas/src', import.meta.url)), fileURLToPath(new URL('../../packages/canvas/server', import.meta.url))] })
  return projectBackendCoverage(project, dataDir ? resolve(cwd, dataDir) : join(hostStore, '.review-data/projects', project.key), inventory.metadata)
}
