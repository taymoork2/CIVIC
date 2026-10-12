import { createHash } from 'node:crypto'
import { relative, posix } from 'node:path'

const sha = (value) => createHash('sha256').update(value).digest('hex')
// Inputs every screen depends on in any project: manifests, lockfiles, images, fonts and the review entries.
const commonInputs = /^application:|\.(?:png|svg|webp|jpe?g|woff2?)$|package(?:-lock)?\.json$|pnpm-lock\.yaml$|\/vite\.config\.ts$|\/review(?:-frame)?\.html$/

/**
 * Conservative module dependencies, not per-export analysis; shared CSS/assets invalidate every screen.
 * A connector adds its own `screens` (screens beyond the scenario registry) and `fingerprint` patterns:
 * `common` inputs every screen depends on, `frame` code that draws every fixture, and `runtime` code
 * that isolated runs execute.
 */
export function fixtureHashes(metadata, evidence, project, inputs = [], { screens = [], fingerprint = {} } = {}) {
  const code = new Map([...evidence].filter(([path]) => !path.startsWith('design:') && !/\.(test|spec|check)\./.test(path)))
  const resolve = (path) => [path, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json', '/index.ts', '/index.tsx', '/index.js'].map((ext) => path + ext)].find((path) => code.has(path))
  const dependency = (from, specifier) => {
    if (specifier.startsWith('.')) return resolve(posix.normalize(posix.join(posix.dirname(from), specifier)))
    for (const [alias, target] of Object.entries(project.aliases ?? {})) if (specifier === alias || specifier.startsWith(alias + '/')) return resolve(relative(project.root, target) + specifier.slice(alias.length))
    return null
  }
  const common = inputs.filter(([path]) => commonInputs.test(path) || fingerprint.common?.test(path))
  // The CIVIC shell and this connector draw the review workspace around fixtures, never the fixture frames themselves.
  for (const [path, content] of code) if (!/^packages\/(?:shell|vite-connector)\//.test(path) && (path.endsWith('.css') || fingerprint.frame?.test(path))) common.push([path, sha(content)])
  const shared = JSON.stringify([project.manifest, common.sort()])
  const declared = new Set(screens.map((screen) => screen.scenario))
  const nodes = metadata.project?.adapter === 'module' ? metadata.scenarios : [...screens, ...metadata.scenarios.filter((row) => !declared.has(row.id))]
  return Object.fromEntries(nodes.map((node) => {
    const scenario = metadata.scenarios.find((row) => row.id === (node.scenario ?? node.id)) ?? node
    const seen = new Map()
    const visit = (path) => {
      if (!path || seen.has(path)) return
      const text = code.get(path)
      if (text === undefined) return
      seen.set(path, sha(text))
      for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) visit(dependency(path, match[1]))
    }
    visit(scenario.component)
    if (fingerprint.runtime && ['runtime', 'towel-runtime'].includes(scenario.renderer)) for (const [path, content] of code) if (fingerprint.runtime.test(path)) seen.set(path, sha(content))
    // Generic adapters can share arbitrary runtime state. Keep their module closure conservative.
    if (metadata.project?.adapter === 'module') for (const [path, content] of code) if (path !== 'project:coverage') seen.set(path, sha(content))
    const { id, label, renderer, fixture, step, screen, component, route, edges, captureFields } = scenario
    return [node.id, sha(shared + JSON.stringify([node.id, { id, label, renderer, fixture, step, screen, component, route, edges, captureFields }, [...seen].sort()]))]
  }))
}
