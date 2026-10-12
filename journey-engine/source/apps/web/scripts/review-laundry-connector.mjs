import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import towel from '../src/review/towel-journey.json' with { type: 'json' }
import { reviewInventory } from './review-laundry-inventory.mjs'
import { reviewOverlay } from './review-laundry.mjs'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Laundry App's connector for @civic/vite-connector (adapter kind `laundry`). It builds Laundry's own
 * review index, mounts the real route tree with review substitutes for auth, the document root and
 * server routes, applies the checked in-memory source overlay, styles frames with Laundry's CSS, and
 * extends the canvas with Laundry's layout and towel journey.
 * The connector package itself names nothing from Laundry.
 */
export const laundryConnector = {
  kind: 'laundry',
  inventory: reviewInventory,
  screens: towel,
  fingerprint: {
    common: /^(?:apps\/web\/public\/|packages\/(?!shell\/|vite-connector\/)|convex\/)|\/review-(?:application|laundry|adapter)\.mjs$/,
    frame: /\/review\/(?:frame\.tsx|laundry-frame\.tsx|adapter\.ts|journey\.ts|store\.ts|adapters\/laundry\.ts)$/,
    runtime: /(?:\/review\/|^packages\/canvas\/src\/)(?:runtime-[^/]+|convex-runtime-client|adapters\/laundry-[^/]+)\.[cm]?[jt]sx?$|\/review-(?:runtime|recording|plugin|laundry)(?:-worker)?\.mjs$|^packages\/canvas\/server\/runtime-[a-z]+\.mjs$/,
  },
  // The handoff ships bounded Laundry design references beside the source tree.
  designRoot: (repo) => process.env.WASHCLOSET_REVIEW_DESIGN ?? resolve(repo, '../design/laundry-reference'),
  // The original Laundry connection keeps the store's top level, where its reviews already live.
  sharedStore: (project) => project.manifest.id === 'laundry-app',
  dedupe: ['@tanstack/react-router', 'convex', 'sonner'],
  serveSources: false,
  // Laundry's flow layout, the towel journey as a guided run, and the older workspace.
  canvasExtension: () => join(web, 'src/review/canvas-extension.ts'),
  resolveId(id, project, importer) {
    if (id === 'virtual:rehearsal-laundry-routes') return '\0' + id
    const appRepo = project.root
    if (!importer?.startsWith(appRepo + '/')) return
    const path = id.startsWith('@/') ? join(appRepo, 'apps/web/src', id.slice(2)) : id.startsWith('.') ? resolve(dirname(importer.split('?')[0]), id) : id
    if ([join(appRepo, 'apps/web/src/auth-client'), join(appRepo, 'apps/web/src/auth-client.ts')].includes(path)) return join(web, 'src/review/adapters/laundry-auth.ts')
    if ([join(appRepo, 'apps/web/src/routes/__root'), join(appRepo, 'apps/web/src/routes/__root.tsx')].includes(path)) return join(web, 'src/review/adapters/laundry-app-root.tsx')
    if (path.startsWith(join(appRepo, 'apps/web/src/routes/api/'))) return '\0rehearsal-server-route:/api/auth/$'
    for (const name of ['care-photo', 'product-lookup']) if ([join(appRepo, 'apps/web/src/routes', name), join(appRepo, 'apps/web/src/routes', name + '.ts')].includes(path)) return '\0rehearsal-server-route:/' + name
  },
  load(id, project) {
    if (id === '\0virtual:rehearsal-laundry-routes') return `export { routeTree } from ${JSON.stringify('/@fs/' + join(project.root, 'apps/web/src/routeTree.gen.ts'))}`
    if (id.startsWith('\0rehearsal-server-route:')) return `import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute(${JSON.stringify(id.slice('\0rehearsal-server-route:'.length))})({ component: () => 'Server routes are outside isolated review.' })`
  },
  transform: (path, code) => reviewOverlay(path, code),
  shellStyle: (project) => `import ${JSON.stringify('/@fs/' + join(project.root, 'apps/web/src/app.css'))}; import ${JSON.stringify('/@fs/' + join(project.root, 'apps/web/src/generated/tokens.css'))}`,
}
