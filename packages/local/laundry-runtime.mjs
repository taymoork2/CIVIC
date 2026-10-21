import { glob } from 'node:fs/promises'
import { join } from 'node:path'
import { runtimeService } from '../canvas/server/runtime-service.mjs'

/** Legacy specimens render presenters directly; restore the product's own viewport gutters. */
export function laundrySpecimenShell() {
  return { name: 'civic-laundry-specimen-shell', enforce: 'pre', transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/review/laundry-frame.tsx')) return
    const presenter = '<DesignPreviewScreen screen={config.scenario.replace(/^legacy\\./, \'\')} onBack={close} />'
    if (!code.includes(presenter)) throw Error('Laundry specimen entry changed; verify its AppShell boundary before capturing.')
    return "import { AppShell } from '@/kit/app-shell'\n" + code.replace(presenter, `<AppShell focus>${presenter}</AppShell>`)
  } }
}

/** Use Laundry's adapter and source functions inside CIVIC's per-run synthetic backend. */
export function laundryRuntime(project, source, { installed, dependencies, dataDir }) {
  return runtimeService(project, source, {
    dataDir,
    // pnpm's dependency index resolves matching packages without installing into source worktrees.
    root: join(installed, 'node_modules/.pnpm'),
    dedupe: Object.keys(dependencies), noExternal: ['@convex-dev/better-auth'],
    aliases: { 'convex-test': join(installed, 'convex/node_modules/convex-test/dist/index.js') },
    async modules() {
      const files = []
      for await (const file of glob('**/*.ts', { cwd: join(project.root, 'convex'), exclude: ['node_modules/**', '**/*.test.ts', '**/*.testing.ts', '**/*.spec.ts'] })) files.push(join(project.root, 'convex', file))
      return { 'virtual:rehearsal-backend': `export const modules = {${files.map(path => `${JSON.stringify(path)}: () => import(${JSON.stringify(path)})`).join(',')}}` }
    },
  })
}
