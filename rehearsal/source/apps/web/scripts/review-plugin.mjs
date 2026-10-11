import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reviewInventory } from './review-inventory.mjs'
import { captureReview, reviewMiddleware } from '@civic/shell/server'
import { laundryReviewAdapter } from './review-adapter.mjs'
import { coverageBridge, coveragePath } from './review-coverage.mjs'
import { civicShared } from './review-civic.mjs'

export function reviewPlugin() {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repo = resolve(web, '../..')
  const dataDir = join(repo, '.review-data')
  // The handoff ships bounded Laundry design references beside the source tree.
  const designRoot = process.env.WASHCLOSET_REVIEW_DESIGN ?? resolve(repo, '../design/laundry-reference')
  return {
    name: 'isolated-product-review',
    enforce: 'pre',
    apply: 'serve',
    async configureServer(server) {
      if (!['127.0.0.1', 'localhost'].includes(server.config.server.host)) throw new Error('Review must bind to loopback. Deployment needs separately scoped review access.')
      const { metadata, evidence } = await reviewInventory(repo, designRoot)
      let refreshing = Promise.resolve()
      let debounce
      let scheduled
      const refresh = (file) => {
        if (!/\.(tsx?|json|css|mjs|mts|ya?ml)$/.test(file) || !(file.startsWith(join(web, 'src') + '/') || file.startsWith(join(web, 'scripts') + '/') || file.startsWith(join(repo, 'packages') + '/') || file.startsWith(join(repo, 'convex') + '/') || [join(repo, coveragePath), join(repo, 'docs/design/review-validation.json'), join(repo, 'package.json'), join(repo, 'pnpm-lock.yaml'), join(web, 'package.json')].includes(file)) || file.includes('/node_modules/')) return
        if (!scheduled) {
        let wake
        const delay = new Promise((resolve) => { wake = resolve })
        scheduled = { wake }
        refreshing = refreshing.then(() => delay).then(async () => {
          const updated = await reviewInventory(repo, designRoot)
          Object.assign(metadata, updated.metadata)
          delete metadata.refreshError
          evidence.clear(); for (const [path, content] of updated.evidence) evidence.set(path, content)
          await auth.refreshCoverage()
        }).catch((error) => {
          metadata.validation = { path: 'docs/design/review-validation.json', status: 'unavailable', receipt: null }
          metadata.refreshError = 'Review inventory could not be refreshed. Repair the source and reload; no current revision is attested.'
          server.config.logger.error(`Review inventory refresh failed: ${error.message}`)
        })
        }
        clearTimeout(debounce)
        debounce = setTimeout(() => { const pending = scheduled; scheduled = null; pending.wake() }, 250)
      }
      server.watcher.on('change', refresh).on('add', refresh).on('unlink', refresh)
      // Inside an Amp orb, PUBLIC_URL names the authenticated portal for this service.
      const publicHost = process.env.AMP_ORB && process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : null
      // Notes and hand-offs go to CIVIC's store in the git common directory, shared by every worktree (D39).
      const shared = process.env.CIVIC_SHARED === '0' ? null : civicShared({ repo })
      const auth = await reviewMiddleware({ dataDir, metadata, evidence, capture: captureReview, adapter: laundryReviewAdapter, coverage: (context) => coverageBridge({ repo, ...context }), publicHost, shared })
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address()
        if (shared && address && typeof address === 'object') shared.registerPreview(`http://127.0.0.1:${address.port}`, join(dataDir, 'access-key')).catch((error) => server.config.logger.warn(`CIVIC preview registration failed: ${error.message}`))
      })
      await auth.refreshCoverage()
      server.watcher.add([join(repo, coveragePath), join(repo, 'docs/design/review-validation.json'), join(repo, 'packages'), join(repo, 'convex'), join(repo, 'pnpm-lock.yaml'), join(repo, 'package.json')])
      server.httpServer?.once('close', () => clearTimeout(debounce))
      server.middlewares.use(async (req, res, next) => { let pending; do { pending = refreshing; await pending } while (pending !== refreshing); return auth(req, res, next) })
      // These entries never mount the app's live providers.
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const entry = ['/', '/review', '/review.html'].includes(url.pathname) ? 'review.html' : url.pathname === '/review-frame.html' ? 'review-frame.html' : null
        if (entry === null) {
          let path
          try { path = decodeURIComponent(url.pathname) } catch { res.writeHead(400); res.end(); return }
          if (/(?:^|\/)(?:\.review-data|\.git|\.env[^/]*)(?:\/|$)/.test(path) || path.startsWith('/@fs/') && !resolve(path.slice(4)).startsWith(repo + '/') || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return }
          if (/^\/(?:@(?:vite|id|fs)(?:\/|$)|@react-refresh$|\.vite\/deps\/|src\/|node_modules\/|assets\/|fonts\/|icons\/)/.test(url.pathname) || /^\/[^/]+\.(?:png|svg|ico|woff2?)$/.test(url.pathname)) return next()
          res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: 'This route is outside synthetic review. No application or research request was sent.' })); return
        }
        try {
          const html = await server.transformIndexHtml(url.pathname, await readFile(join(web, entry), 'utf8'))
          res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store', 'x-frame-options': 'SAMEORIGIN' }); res.end(html)
        } catch (error) { next(error) }
      })
      console.info(`Synthetic review store: ${dataDir}. Local access key: ${join(dataDir, 'access-key')}${shared ? '. Notes are shared with every worktree through the civic CLI.' : ''}`)
    },
  }
}
