import { readFile } from 'node:fs/promises'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reviewInventory } from './review-inventory.mjs'
import { captureReview, reviewMiddleware } from '@civic/shell/server'
import { laundryReviewAdapter } from './review-adapter.mjs'
import { agentDestinations, dispatchReview, publicDestination } from './review-agents.mjs'
import { coverageBridge } from './review-coverage.mjs'
import { civicShared } from './review-civic.mjs'
import { reviewOverlay } from './review-laundry.mjs'
import { loadProject, publicProject } from './review-project.mjs'
import { projectPicker } from './review-projects.mjs'
import { runtimeService } from './review-runtime.mjs'

export function reviewPlugin() {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repo = resolve(web, '../..')
  const viteClientEnv = join(dirname(fileURLToPath(import.meta.resolve('vite/package.json'))), 'dist/client/env.mjs')
  let project = loadProject(repo)
  const appRepo = project.root
  const publicOrigin = process.env.REHEARSAL_PUBLIC_ORIGIN ?? project.local.publicOrigin
  const laundry = project.manifest.adapter.kind === 'laundry'
  const storeRoot = process.env.REHEARSAL_DATA_DIR ? resolve(process.env.REHEARSAL_DATA_DIR) : join(repo, '.review-data')
  const dataDir = laundry && project.manifest.id === 'laundry-app' ? storeRoot : join(storeRoot, 'projects', project.key)
  // The handoff ships bounded Laundry design references beside the source tree.
  const designRoot = process.env.REHEARSAL_DESIGN_ROOT ?? (laundry ? process.env.WASHCLOSET_REVIEW_DESIGN ?? resolve(repo, '../design/laundry-reference') : undefined)
  const watchPaths = () => [...project.sources, project.manifestPath, project.scenariosPath, project.coverageFile, ...(project.entry ? [dirname(project.entry)] : []), ...(project.publicDir ? [project.publicDir] : []), join(web, 'src/review'), join(web, 'scripts'), join(repo, '.review-data/application.json'), join(repo, 'docs/design/review-validation.json'), ...[repo, appRepo].flatMap((root) => ['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'tsconfig.json'].map((file) => join(root, file)))]
  const compilation = (value) => JSON.stringify([value.root, value.entry, value.runtimeEntry, value.aliases, value.publicDir, value.coverageFile, value.manifest.adapter.kind, value.key, process.env.REHEARSAL_PUBLIC_ORIGIN ?? value.local.publicOrigin])
  const binding = compilation(project)
  return {
    name: 'isolated-product-review',
    enforce: 'pre',
    apply: 'serve',
    config(config) {
      config.resolve ??= {}
      config.server ??= {}
      config.publicDir = project.publicDir
      config.resolve.alias = { ...config.resolve.alias, ...project.aliases }
      config.resolve.dedupe = ['react', 'react-dom', '@tanstack/react-router', 'convex', 'sonner']
      config.server.fs = { ...config.server.fs, allow: [...new Set([repo, appRepo, project.manifestRoot, viteClientEnv])] }
      config.optimizeDeps = { ...config.optimizeDeps, entries: ['review.html', 'review-frame.html'] }
    },
    resolveId(id, importer) {
      if (['virtual:rehearsal-project', 'virtual:rehearsal-preview', 'virtual:rehearsal-shell-style', 'virtual:rehearsal-laundry-routes'].includes(id)) return '\0' + id
      if (laundry && importer?.startsWith(appRepo + '/')) {
        const path = id.startsWith('@/') ? join(appRepo, 'apps/web/src', id.slice(2)) : id.startsWith('.') ? resolve(dirname(importer.split('?')[0]), id) : id
        if ([join(appRepo, 'apps/web/src/auth-client'), join(appRepo, 'apps/web/src/auth-client.ts')].includes(path)) return join(web, 'src/review/adapters/laundry-auth.ts')
        if ([join(appRepo, 'apps/web/src/routes/__root'), join(appRepo, 'apps/web/src/routes/__root.tsx')].includes(path)) return join(web, 'src/review/adapters/laundry-app-root.tsx')
        if (path.startsWith(join(appRepo, 'apps/web/src/routes/api/'))) return '\0rehearsal-server-route:/api/auth/$'
        for (const name of ['care-photo', 'product-lookup']) if ([join(appRepo, 'apps/web/src/routes', name), join(appRepo, 'apps/web/src/routes', name + '.ts')].includes(path)) return '\0rehearsal-server-route:/' + name
      }
    },
    load(id) {
      if (id === '\0virtual:rehearsal-project') return `export default ${JSON.stringify(publicProject(project))}`
      if (id === '\0virtual:rehearsal-laundry-routes') return `export { routeTree } from ${JSON.stringify('/@fs/' + join(appRepo, 'apps/web/src/routeTree.gen.ts'))}`
      if (id.startsWith('\0rehearsal-server-route:')) return `import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute(${JSON.stringify(id.slice('\0rehearsal-server-route:'.length))})({ component: () => 'Server routes are outside isolated review.' })`
      if (id === '\0virtual:rehearsal-preview') return project.entry ? `export { mount } from ${JSON.stringify('/@fs/' + project.entry)}` : 'export function mount() { throw Error("This project has no preview adapter. Connect a synthetic mount entry first.") }'
      if (id === '\0virtual:rehearsal-shell-style') return laundry ? `import ${JSON.stringify('/@fs/' + join(appRepo, 'apps/web/src/app.css'))}; import ${JSON.stringify('/@fs/' + join(appRepo, 'apps/web/src/generated/tokens.css'))}` : ''
    },
    transform(code, id) {
      if (!laundry || !id.startsWith(appRepo + '/')) return
      const updated = reviewOverlay(relative(appRepo, id.split('?')[0]), code)
      return updated === code ? undefined : { code: updated, map: null }
    },
    async configureServer(server) {
      if (!['127.0.0.1', 'localhost'].includes(server.config.server.host)) throw new Error('Review must bind to loopback. Deployment needs separately scoped review access.')
      const { metadata, evidence } = await reviewInventory(repo, designRoot, appRepo, project)
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
          const updated = await reviewInventory(repo, designRoot, appRepo, project)
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
      // Inside an Amp orb, PUBLIC_URL names the authenticated portal for this service.
      const publicHost = process.env.AMP_ORB && process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : null
      // Notes and hand-offs go to CIVIC's store in the git common directory, shared by every worktree (D39).
      const shared = process.env.CIVIC_SHARED === '0' ? null : civicShared({ repo })
      const projects = await projectPicker(repo, project)
      const runtime = runtimeService(project, () => { if (pendingRefreshes) throw Object.assign(Error('Source is updating. Wait for refresh before starting a new run.'), { status: 409 }); if (metadata.refreshError) throw Error(metadata.refreshError); return metadata.revision.source })
      const auth = await reviewMiddleware({ dataDir, metadata, evidence, capture: captureReview, adapter: laundryReviewAdapter, coverage: (context) => coverageBridge({ repo, contractFile: project.coverageFile, contractRoot: project.manifestRoot, ...context }), agents: { destinations: agentDestinations, dispatch: dispatchReview, publicDestination }, publicHost, publicOrigin, shared, projects, runtime, restart: () => server.restart().catch((error) => server.config.logger.error(`Project restart failed: ${error.message}`)) })
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address()
        if (shared && address && typeof address === 'object') shared.registerPreview(`http://127.0.0.1:${address.port}`, join(dataDir, 'access-key')).catch((error) => server.config.logger.warn(`CIVIC preview registration failed: ${error.message}`))
      })
      await auth.refreshCoverage()
      server.watcher.add(watchPaths())
      server.httpServer?.once('close', () => { clearTimeout(debounce); void runtime.close() })
      server.middlewares.use(async (req, res, next) => { let pending; do { pending = refreshing; await pending } while (pending !== refreshing); return auth(req, res, next) })
      // These entries never mount the app's live providers.
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const entry = ['/', '/review', '/review.html'].includes(url.pathname) ? 'review.html' : url.pathname === '/review-frame.html' ? 'review-frame.html' : null
        if (entry === null) {
          let path
          try { path = decodeURIComponent(url.pathname) } catch { res.writeHead(400); res.end(); return }
          if (/(?:^|\/)(?:\.review-data|\.git|\.env[^/]*)(?:\/|$)/.test(path) || path.startsWith('/@fs/') && resolve(path.slice(4)) !== viteClientEnv && ![repo, appRepo, project.manifestRoot].some((root) => resolve(path.slice(4)).startsWith(root + '/')) || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return }
          const cachePath = relative(web, server.config.cacheDir)
          const cachedModule = !cachePath.startsWith('../') && path.startsWith('/' + cachePath + '/deps/') && /\.(?:js|map|json)$/.test(path)
          if (cachedModule || /^\/(?:@(?:vite|id|fs)(?:\/|$)|@react-refresh$|\.vite\/deps\/|src\/|node_modules\/|assets\/|fonts\/|icons\/)/.test(url.pathname) || /^\/[^/]+\.(?:png|webp|jpe?g|svg|ico|woff2?)$/.test(url.pathname) || /^\/design\/[^/]+\.(?:png|webp|jpe?g|svg)$/.test(url.pathname)) return next()
          if (!laundry && /\.(?:[cm]?[jt]sx?|css|json|svg|png|woff2?)$/.test(url.pathname) && [...project.sources, ...(project.entry ? [project.entry] : [])].some((file) => { const path = relative(web, file); return !path.startsWith('../') && (url.pathname === '/' + path || url.pathname.startsWith('/' + path + '/')) })) return next()
          res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'This route is outside synthetic review. No application or research request was sent.' })); return
        }
        try {
          const html = await server.transformIndexHtml(url.pathname, await readFile(join(web, entry), 'utf8'))
          if (entry === 'review-frame.html') res.setHeader('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; form-action 'none'; object-src 'none'; base-uri 'self'")
          res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store', 'x-frame-options': 'SAMEORIGIN' }); res.end(html)
        } catch (error) { next(error) }
      })
      console.info(`Synthetic review store: ${dataDir}. Application source: ${appRepo} (read only). Open the local preview directly; CIVIC tools use the key in ${join(dataDir, 'access-key')}.${shared ? ' Notes are shared with every worktree through the civic CLI.' : ''}`)
    },
  }
}
