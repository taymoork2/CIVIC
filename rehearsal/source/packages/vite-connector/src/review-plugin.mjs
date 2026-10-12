import { readFile } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureReview, reviewMiddleware } from '@civic/shell/server'
import { reviewInventory } from './review-inventory.mjs'
import { loadProject, publicProject } from './review-project.mjs'
import { projectPicker } from './review-projects.mjs'

/**
 * CIVIC's Vite connector: a dev-only Vite plugin that turns a review host into the journey
 * canvas for one connected project. The project is any checkout with a `rehearsal.project.json`
 * manifest; the connector reads it read-only, indexes and fingerprints its screens, serves the
 * review entries and the app's sources to them, refreshes on change, and mounts the
 * `@civic/shell` review server.
 *
 * `host` is the folder holding `review.html` and `review-frame.html`; `repo` is the workspace
 * that owns the review store (`.review-data`). A `module` project needs nothing else. Any other
 * adapter kind needs a connector in `connectors` (Laundry registers `laundry`), which may supply:
 *   inventory(repo, designRoot, appRoot)  its own review index
 *   screens, fingerprint                  screens beyond the scenario registry, and fingerprint inputs
 *   designRoot(repo)                       where its design references live
 *   sharedStore(project)                   true to keep the store's top level rather than a per-project folder
 *   dedupe                                 packages the app and its review must share
 *   resolveId/load(id, project, importer)  extra modules, such as substitutes for app boot or auth files
 *   transform(path, code, project)         checked, in-memory edits of app source (never written back)
 *   shellStyle(project)                    CSS imports that style the review frame like the app
 *   serveSources                           false when the host already serves the app's sources
 * `review({ project, repo, dataDir })` returns the shell's options (adapter, coverage, agents, shared,
 * publicHost). `runtime(project, source)` starts the isolated backend for live runs, when the app has one.
 * Routine indexing, refresh and serving make no model calls.
 */
export function civicReview({ host, repo = resolve(host, '../..'), connectors = {}, review = () => ({}), runtime = null, engineRoots, picker = {} }) {
  const viteClientEnv = join(dirname(fileURLToPath(import.meta.resolve('vite/package.json'))), 'dist/client/env.mjs')
  let project = loadProject(repo)
  const kind = project.manifest.adapter.kind
  const connector = kind === 'module' ? null : connectors[kind]
  if (kind !== 'module' && !connector) throw Error(`No connector is registered for adapter kind ${kind}. Register one with civicReview({ connectors }).`)
  const appRepo = project.root
  const publicOrigin = process.env.REHEARSAL_PUBLIC_ORIGIN ?? project.local.publicOrigin
  const storeRoot = process.env.REHEARSAL_DATA_DIR ? resolve(process.env.REHEARSAL_DATA_DIR) : join(repo, '.review-data')
  const dataDir = connector?.sharedStore?.(project) ? storeRoot : join(storeRoot, 'projects', project.key)
  const designRoot = process.env.REHEARSAL_DESIGN_ROOT ?? connector?.designRoot?.(repo)
  const inventoryOptions = { connector, ...(engineRoots ? { engineRoots } : {}) }
  const watchPaths = () => [...project.sources, project.manifestPath, project.scenariosPath, project.coverageFile, ...(project.entry ? [dirname(project.entry)] : []), ...(project.publicDir ? [project.publicDir] : []), ...(engineRoots ?? [join(host, 'src/review'), join(host, 'scripts')]), dirname(fileURLToPath(import.meta.url)), join(repo, '.review-data/application.json'), join(repo, 'docs/design/review-validation.json'), ...[repo, appRepo].flatMap((root) => ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'tsconfig.json'].map((file) => join(root, file)))]
  const compilation = (value) => JSON.stringify([value.root, value.entry, value.runtimeEntry, value.aliases, value.publicDir, value.coverageFile, value.manifest.adapter.kind, value.key, process.env.REHEARSAL_PUBLIC_ORIGIN ?? value.local.publicOrigin])
  const binding = compilation(project)
  const modules = { 'virtual:rehearsal-project': () => `export default ${JSON.stringify(publicProject(project))}`, 'virtual:rehearsal-preview': () => project.entry ? `export { mount } from ${JSON.stringify('/@fs/' + project.entry)}` : 'export function mount() { throw Error("This project has no preview adapter. Connect a synthetic mount entry first.") }', 'virtual:rehearsal-shell-style': () => connector?.shellStyle?.(project) ?? '' }
  return {
    name: 'isolated-product-review',
    enforce: 'pre',
    apply: 'serve',
    config(config) {
      config.resolve ??= {}
      config.server ??= {}
      config.publicDir = project.publicDir
      config.resolve.alias = { ...config.resolve.alias, ...project.aliases }
      config.resolve.dedupe = [...new Set(['react', 'react-dom', ...(connector?.dedupe ?? [])])]
      config.server.fs = { ...config.server.fs, allow: [...new Set([repo, appRepo, project.manifestRoot, viteClientEnv])] }
      config.optimizeDeps = { ...config.optimizeDeps, entries: ['review.html', 'review-frame.html'] }
    },
    resolveId(id, importer) {
      if (id in modules) return '\0' + id
      return connector?.resolveId?.(id, project, importer)
    },
    load(id) {
      if (id.startsWith('\0') && id.slice(1) in modules) return modules[id.slice(1)]()
      return connector?.load?.(id, project)
    },
    transform(code, id) {
      if (!connector?.transform || !id.startsWith(appRepo + '/')) return
      const updated = connector.transform(relative(appRepo, id.split('?')[0]), code, project)
      return updated === code ? undefined : { code: updated, map: null }
    },
    async configureServer(server) {
      if (!['127.0.0.1', 'localhost'].includes(server.config.server.host)) throw new Error('Review must bind to loopback. Deployment needs separately scoped review access.')
      const { metadata, evidence } = await reviewInventory(repo, designRoot, appRepo, project, inventoryOptions)
      let refreshing = Promise.resolve()
      let pendingRefreshes = 0
      let debounce
      let scheduled
      const refresh = (file) => {
        if (file.includes('/node_modules/') || !watchPaths().some((path) => file === path || file.startsWith(path + '/'))) return
        if (!scheduled) {
        pendingRefreshes++
        let wake
        const delay = new Promise((resolve) => { wake = resolve })
        scheduled = { wake }
        refreshing = refreshing.then(() => delay).then(async () => {
          const nextProject = loadProject(repo)
          if (compilation(nextProject) !== binding) throw Error('Project adapter or checkout binding changed. Restart Rehearsal to apply it without mixing projects.')
          project = nextProject
          server.watcher.add(watchPaths())
          const updated = await reviewInventory(repo, designRoot, appRepo, project, inventoryOptions)
          // New frames must compile the linked source, while open runs keep their DOM.
          server.environments.client.moduleGraph.invalidateAll()
          Object.assign(metadata, updated.metadata)
          delete metadata.refreshError
          evidence.clear(); for (const [path, content] of updated.evidence) evidence.set(path, content)
          await auth.refreshCoverage()
        }).catch((error) => {
          metadata.validation = { path: 'docs/design/review-validation.json', status: 'unavailable', receipt: null }
          metadata.refreshError = 'Review inventory could not be refreshed. Repair the source and reload; no current revision is attested.'
          server.config.logger.error(`Review inventory refresh failed: ${error.message}`)
        }).finally(() => { pendingRefreshes-- })
        }
        clearTimeout(debounce)
        debounce = setTimeout(() => { const pending = scheduled; scheduled = null; pending.wake() }, 250)
      }
      server.watcher.on('change', refresh).on('add', refresh).on('unlink', refresh)
      const projects = await projectPicker(repo, project, { ...picker, kinds: ['module', ...Object.keys(connectors)] })
      const source = () => { if (pendingRefreshes) throw Object.assign(Error('Source is updating. Wait for refresh before starting a new run.'), { status: 409 }); if (metadata.refreshError) throw Error(metadata.refreshError); return metadata.revision.source }
      const runs = runtime?.(project, source)
      const options = await review({ project, repo, dataDir })
      const auth = await reviewMiddleware({ dataDir, metadata, evidence, capture: captureReview, publicOrigin, projects, ...options, ...(runs ? { runtime: runs } : {}), restart: () => server.restart().catch((error) => server.config.logger.error(`Project restart failed: ${error.message}`)) })
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address()
        if (options.shared && address && typeof address === 'object') options.shared.registerPreview(`http://127.0.0.1:${address.port}`, join(dataDir, 'access-key')).catch((error) => server.config.logger.warn(`CIVIC preview registration failed: ${error.message}`))
      })
      await auth.refreshCoverage()
      server.watcher.add(watchPaths())
      server.httpServer?.once('close', () => { clearTimeout(debounce); void runs?.close() })
      server.middlewares.use(async (req, res, next) => { let pending; do { pending = refreshing; await pending } while (pending !== refreshing); return auth(req, res, next) })
      // These entries never mount the app's live providers.
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const entry = ['/', '/review', '/review.html'].includes(url.pathname) ? 'review.html' : url.pathname === '/review-frame.html' ? 'review-frame.html' : null
        if (entry === null) {
          let path
          try { path = decodeURIComponent(url.pathname) } catch { res.writeHead(400); res.end(); return }
          if (/(?:^|\/)(?:\.review-data|\.git|\.env[^/]*)(?:\/|$)/.test(path) || path.startsWith('/@fs/') && resolve(path.slice(4)) !== viteClientEnv && ![repo, appRepo, project.manifestRoot].some((root) => resolve(path.slice(4)).startsWith(root + '/')) || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return }
          const cachePath = relative(host, server.config.cacheDir)
          const cachedModule = !cachePath.startsWith('../') && path.startsWith('/' + cachePath + '/deps/') && /\.(?:js|map|json)$/.test(path)
          if (cachedModule || /^\/(?:@(?:vite|id|fs)(?:\/|$)|@react-refresh$|\.vite\/deps\/|src\/|node_modules\/|assets\/|fonts\/|icons\/)/.test(url.pathname) || /^\/[^/]+\.(?:png|webp|jpe?g|svg|ico|woff2?)$/.test(url.pathname) || /^\/design\/[^/]+\.(?:png|webp|jpe?g|svg)$/.test(url.pathname)) return next()
          if (connector?.serveSources !== false && /\.(?:[cm]?[jt]sx?|css|json|svg|png|woff2?)$/.test(url.pathname) && [...project.sources, ...(project.entry ? [project.entry] : [])].some((file) => { const path = relative(host, file); return !path.startsWith('../') && (url.pathname === '/' + path || url.pathname.startsWith('/' + path + '/')) })) return next()
          res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'This route is outside synthetic review. No application or research request was sent.' })); return
        }
        try {
          const html = await server.transformIndexHtml(url.pathname, await readFile(join(host, entry), 'utf8'))
          if (entry === 'review-frame.html') res.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; form-action 'none'; object-src 'none'; base-uri 'self'")
          res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store', 'x-frame-options': 'SAMEORIGIN' }); res.end(html)
        } catch (error) { next(error) }
      })
      console.info(`Synthetic review store: ${dataDir}. Application source: ${appRepo} (read only). Open the local preview directly; CIVIC tools use the key in ${join(dataDir, 'access-key')}.${options.shared ? ' Notes are shared with every worktree through the civic CLI.' : ''}`)
    },
  }
}
