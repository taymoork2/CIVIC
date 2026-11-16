import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

export async function readBackendCoverage(cwd: string, manifest = '.', store = '.', dataDir?: string) {
  const { project, metadata, hostStore, sharedStore } = await readProjectInventory(cwd, manifest, store)
  const { projectBackendCoverage } = await import(new URL('../../packages/canvas/server/backend-coverage.mjs', import.meta.url).href)
  return projectBackendCoverage(project, dataDir ? resolve(cwd, dataDir) : sharedStore ? join(hostStore, '.review-data') : join(hostStore, '.review-data/projects', project.key), metadata)
}

export async function readProjectInventory(cwd: string, manifest = '.', store = '.') {
  const moduleAt = (path: string) => new URL(path, import.meta.url).href
  const { loadProject } = await import(moduleAt('../../packages/vite-connector/src/review-project.mjs'))
  const { reviewInventory } = await import(moduleAt('../../packages/vite-connector/src/review-inventory.mjs'))
  const hostStore = resolve(cwd, store)
  const discover = () => {
    try { return loadProject(cwd) } catch (error) {
      const notebook = resolve(cwd, 'packages/canvas/examples/notebook/civic.project.json')
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT' && 'path' in error && error.path === resolve(cwd, 'civic.json') && existsSync(notebook)) return loadProject(cwd, { manifest: notebook })
      throw error
    }
  }
  let selected = resolve(cwd, manifest)
  if (!existsSync(selected) && /^[a-z][a-z0-9.-]{0,119}-[a-f0-9]{12}$/.test(manifest)) {
    const current = discover()
    if (manifest === current.key) selected = current.manifestPath
  }
  const project = manifest === '.' ? discover() : loadProject(cwd, { manifest: selected })
  const inventory = await reviewInventory(project.manifest.adapter.kind === 'module' ? hostStore : cwd, undefined, undefined, project, { engineRoots: [fileURLToPath(new URL('../../packages/canvas/src', import.meta.url)), fileURLToPath(new URL('../../packages/canvas/server', import.meta.url))] })
  return { project, metadata: inventory.metadata, hostStore, sharedStore: inventory.sharedStore }
}
