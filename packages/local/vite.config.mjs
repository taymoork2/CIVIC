import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import tailwindcss from '@tailwindcss/vite'
import { canvasPlugins } from '@civic/canvas'
import { loadProject } from '@civic/vite-connector/project'
import { store, repo } from './onboard.mjs'
import { orcaConnector, orcaLivePlugin } from './orca-live.mjs'
import { moduleReviewAdapter } from '../canvas/server/module-adapter.mjs'
import { runtimeService as moduleRuntime } from '../canvas/server/runtime-service.mjs'
import { isolatedOrcaConnector, isolatedOrcaAssets } from './orca-isolated.mjs'
import { verifyOrca, verifyLaundry } from './verify-behavior.mjs'
import { worktreeConnections } from './orca-worktrees.mjs'
import { createServer } from 'vite'
import { projectWindows } from './project-windows.mjs'

const config = JSON.parse(await readFile(join(store, 'local-config.json'), 'utf8'))
// Linked isolated workspaces reuse the main workspace's worktree builds.
const syncConnections = process.env.CIVIC_LOCAL_STORE ? undefined : worktreeConnections(store, config.orcaRuntimeSource ?? '/Users/taymoor/.orca-dogfood/app')
const scripts = join(config.laundry, 'apps/web/scripts')
const { laundryConnector } = await import(pathToFileURL(join(scripts, 'review-laundry-connector.mjs')))
const { laundryReviewAdapter } = await import(pathToFileURL(join(scripts, 'review-adapter.mjs')))
const { runtimeService } = await import(pathToFileURL(join(scripts, 'review-runtime.mjs')))
process.env.WASHCLOSET_REVIEW_DESIGN = join(repo, 'journey-engine/design/laundry-reference')
const laundryConnection = {
  ...laundryConnector, sharedStore: () => false,
  async inventory(_store, designRoot, appRoot) {
    const result = await laundryConnector.inventory(config.laundry, designRoot, appRoot)
    result.metadata.revision.source = createHash('sha256').update(result.metadata.revision.source).update(await readFile(new URL('./verify-behavior.mjs', import.meta.url))).digest('hex')
    return result
  },
}
const reviewAdapter = async ({ project }) => {
  if (project.manifest.adapter.kind === 'laundry') return { adapter: { ...laundryReviewAdapter, exploreFixture: moduleReviewAdapter.exploreFixture, explorationScenarios: scenarios => scenarios.filter(row => (row.renderer === 'runtime' || row.id.startsWith('intake.towel.')) && row.preview !== 'requires-start-state').sort((a, b) => Number(!a.id.startsWith('app.')) - Number(!b.id.startsWith('app.'))), verifyBehavior: verifyLaundry } }
  if (['orca-live', 'orca-isolated'].includes(project.manifest.adapter.kind)) return { adapter: { ...moduleReviewAdapter, ...(project.manifest.adapter.kind === 'orca-isolated' ? { verifyBehavior: verifyOrca } : {}), screens: JSON.parse(await readFile(project.scenariosPath, 'utf8')) } }
  return {}
}
const port = Number(process.env.CIVIC_LOCAL_PORT ?? 3012)
const registry = {}
const windows = projectWindows({ current: loadProject(store).key, origin: `http://127.0.0.1:${port}`, async createHost(project, hostPort = 0) {
  const server = await createServer({ ...configuration({ manifest: project.manifestPath, applicationRoot: project.root }, true, hostPort), configFile: false })
  try {
    await server.listen()
    const address = server.httpServer.address()
    return { url: `http://127.0.0.1:${address.port}/review`, close: () => server.close() }
  } catch (error) { await server.close(); throw error }
} })
function configuration(connection = {}, windowHost = false, hostPort = 0) {
const project = loadProject(store, connection)
return {
  root: join(config.laundry, 'apps/web'),
  cacheDir: windowHost ? join(store, '.vite/windows', project.key) : join(store, '.vite'),
  resolve: { alias: { '@civic/canvas/runtime-session': fileURLToPath(new URL('../canvas/src/runtime-session.ts', import.meta.url)), '@civic/shell/capture': fileURLToPath(new URL('../shell/src/capture.ts', import.meta.url)), ...Object.fromEntries(['use-sync-external-store', 'obscenity'].map(name => [name, join(config.laundry, 'node_modules/.pnpm/node_modules', name)])) } },
  // shortcut: preload Laundry's UI imports to keep React stable; update when its dependencies change.
  optimizeDeps: { noDiscovery: true, include: [
    ...['alert-dialog', 'checkbox', 'checkbox-group', 'collapsible', 'drawer', 'merge-props', 'popover', 'radio-group', 'radio', 'separator', 'tabs', 'toggle', 'toggle-group', 'use-render'].map(name => `@base-ui/react/${name}`),
    'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@tanstack/react-router', 'sonner',
    'class-variance-authority', 'clsx', 'convex/browser', 'convex/react', 'convex/server', 'convex/values', 'obscenity', 'tailwind-merge',
    'use-sync-external-store/shim/with-selector', 'use-sync-external-store/shim',
  ] },
  server: { host: '127.0.0.1', port: windowHost ? hostPort : port, strictPort: !windowHost || hostPort > 0, hmr: false, allowedHosts: !windowHost && process.env.CIVIC_PUBLIC_ORIGIN ? [new URL(process.env.CIVIC_PUBLIC_ORIGIN).hostname] : [] },
  plugins: [orcaLivePlugin({ store, source: config.orcaRuntimeSource ?? '/Users/taymoor/.orca-dogfood/app', publicOrigin: windowHost ? null : config.origin }), isolatedOrcaAssets({ store, source: config.orcaRuntimeSource ?? '/Users/taymoor/.orca-dogfood/app' }), tailwindcss(), ...canvasPlugins({ store, project: connection, restart: windowHost ? project => windows.refresh(project) : undefined, designRoot: project.manifest.id === 'orca-design-study' ? join(project.manifestRoot, 'design') : join(repo, 'journey-engine/design/laundry-reference'), picker: { registry, workspaces: config.workspaces ?? [], syncConnections: windowHost ? undefined : syncConnections, openWindow: (project, lease) => windows.open(project, lease), releaseWindow: (project, lease) => windows.release(project.key, lease), windowOrigins: windows.origins }, connectors: { 'orca-live': orcaConnector, 'orca-isolated': isolatedOrcaConnector, laundry: laundryConnection }, runtime: (project, source, options) => project.manifest.adapter.kind === 'laundry' ? runtimeService(project, source, options) : moduleRuntime(project, source, options), review: reviewAdapter }), ...windowHost ? [] : [{ name: 'civic-project-windows', configureServer(server) { server.httpServer.once('close', () => void windows.close()) } }]],
}
}
export default configuration()
