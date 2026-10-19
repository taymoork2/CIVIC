import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, symlink, copyFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { loadProject } from '@civic/vite-connector/project'
import { projectPicker } from '@civic/vite-connector/projects'
import { repo } from './onboard.mjs'
import { connectIsolatedOrca } from './orca-isolated.mjs'

/** A separate CIVIC store and Laundry checkout; all application writes use per-run synthetic backends. */
export async function isolate() {
  const original = join(repo, '.civic-canvas')
  const config = JSON.parse(await readFile(join(original, 'local-config.json'), 'utf8'))
  const parent = join(original, 'dogfood'); await mkdir(parent, { recursive: true, mode: 0o700 })
  const store = await mkdtemp(join(parent, 'run-'))
  const sourceRoot = join(homedir(), 'Projects/civic-instances'); await mkdir(sourceRoot, { recursive: true, mode: 0o700 })
  const laundry = await mkdtemp(join(sourceRoot, 'laundry-'))
  execFileSync('git', ['clone', '--local', '--no-hardlinks', config.laundry, laundry], { stdio: 'pipe' })
  for (const file of ['apps/web/package.json', 'pnpm-lock.yaml']) await copyFile(join(config.laundry, file), join(laundry, file))
  for (const path of ['', 'apps/web', 'convex', 'packages/icons', 'packages/planner']) {
    const deps = join(config.laundry, path, 'node_modules')
    if (await stat(deps).then(() => true).catch(() => false)) await symlink(deps, join(laundry, path, 'node_modules'))
  }
  const source = config.orcaRuntimeSource ?? '/Users/taymoor/.orca-dogfood/app'
  const receipt = JSON.parse(await readFile(join(original, 'projects/orca-live/receipt.json'), 'utf8'))
  const key = await connectIsolatedOrca(store, source, receipt)
  const project = loadProject(store)
  const picker = await projectPicker(store, project, { kinds: ['module', 'laundry', 'orca-isolated'] })
  const laundryConnection = await picker.add({ kind: 'existing', root: laundry, manifest: 'civic.project.json', app: { id: 'laundry', name: 'Laundry App' }, connectionKind: 'isolated' })
  await writeFile(join(store, 'local-config.json'), JSON.stringify({ ...config, laundry, origin: null }, null, 2), { mode: 0o600 })
  const result = { store, port: 3013, orca: key, laundry: laundryConnection.key, laundryRoot: laundry, source, isolation: 'Separate CIVIC store, separate external Laundry checkout, synthetic per-run backends; no provider dispatch or external Convex.' }
  await writeFile(join(store, 'isolation.json'), JSON.stringify(result, null, 2), { mode: 0o600 })
  return result
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await isolate(), null, 2))
