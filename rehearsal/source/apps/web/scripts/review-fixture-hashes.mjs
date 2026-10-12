import { createHash } from 'node:crypto'
import { relative, posix } from 'node:path'
import towel from '../src/review/towel-journey.json' with { type: 'json' }

const sha = (value) => createHash('sha256').update(value).digest('hex')
/** Conservative module dependencies, not per-export analysis; shared CSS/assets invalidate every screen. */
export function fixtureHashes(metadata, evidence, project, inputs = []) {
  const code = new Map([...evidence].filter(([path]) => !path.startsWith('design:') && !/\.(test|spec|check)\./.test(path)))
  const resolve = (path) => [path, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json', '/index.ts', '/index.tsx', '/index.js'].map((ext) => path + ext)].find((path) => code.has(path))
  const dependency = (from, specifier) => {
    if (specifier.startsWith('.')) return resolve(posix.normalize(posix.join(posix.dirname(from), specifier)))
    for (const [alias, target] of Object.entries(project.aliases ?? {})) if (specifier === alias || specifier.startsWith(alias + '/')) return resolve(relative(project.root, target) + specifier.slice(alias.length))
    return null
  }
  const common = inputs.filter(([path]) => /^(?:apps\/web\/public\/|packages\/(?!shell\/)|convex\/|application:)|\.(?:png|svg|webp|jpe?g|woff2?)$|package(?:-lock)?\.json$|pnpm-lock\.yaml$|\/review-(?:application|laundry|adapter)\.mjs$|\/vite\.config\.ts$|\/review(?:-frame)?\.html$/.test(path))
  // The CIVIC shell draws the review workspace around fixtures, never the fixture frames themselves.
  for (const [path, content] of code) if (!path.startsWith('packages/shell/') && (path.endsWith('.css') || /\/review\/(?:frame\.tsx|laundry-frame\.tsx|adapter\.ts|journey\.ts|store\.ts|adapters\/laundry\.ts)$/.test(path))) common.push([path, sha(content)])
  const shared = JSON.stringify([project.manifest, common.sort()])
  const nodes = metadata.project?.adapter === 'module' ? metadata.scenarios : [...towel, ...metadata.scenarios.filter((row) => !row.id.startsWith('intake.towel.'))]
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
    if (['runtime', 'towel-runtime'].includes(scenario.renderer)) for (const [path, content] of code) if (/\/review\/(?:runtime-[^/]+|convex-runtime-client|adapters\/laundry-[^/]+)\.[cm]?[jt]sx?$|\/review-(?:runtime|recording|plugin|laundry)(?:-worker)?\.mjs$/.test(path)) seen.set(path, sha(content))
    // Generic adapters can share arbitrary runtime state. Keep their module closure conservative.
    if (metadata.project?.adapter === 'module') for (const [path, content] of code) if (path !== 'project:coverage') seen.set(path, sha(content))
    const { id, label, renderer, fixture, step, screen, component, route, edges, captureFields } = scenario
    return [node.id, sha(shared + JSON.stringify([node.id, { id, label, renderer, fixture, step, screen, component, route, edges, captureFields }, [...seen].sort()]))]
  }))
}
