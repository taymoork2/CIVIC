import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { projectPath } from './review-project.mjs'

export const coveragePath = 'docs/design/review-product/coverage.json'
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const words = (s, max) => typeof s === 'string' && s.trim() && s.length <= max ? s.trim() : fail('Invalid or oversized coverage text')
export function checkedContract(input) {
  if (!input || !Number.isInteger(input.version) || input.version < 1 || !Array.isArray(input.targets) || input.targets.length > 200) fail('Invalid coverage contract')
  const ids = new Set()
  const targets = input.targets.map((t) => {
    if (!t || !/^[a-z][a-z0-9.-]{0,119}$/.test(t.id) || ids.has(t.id) || !['screen', 'interaction', 'journey'].includes(t.kind)) fail('Invalid or duplicate coverage identity')
    ids.add(t.id)
    if (!Array.isArray(t.scenarios) || t.scenarios.length > 100 || !Array.isArray(t.acceptance) || t.acceptance.length > 20) fail('Invalid coverage expectations')
    if (t.component !== undefined && (!/^(?:[a-zA-Z0-9_$.-]+\/)*[a-zA-Z0-9_$.-]+\.(?:[cm]?[jt]sx?)(?:#[a-zA-Z0-9_]+)?$/.test(t.component) || t.component.split('/').some((part) => part === '..' || part === '.' || part === '.git' || part === '.review-data'))) fail('Use an application source path')
    return { id: t.id, title: words(t.title, 160), kind: t.kind, ...(t.component ? { component: t.component } : {}), scenarios: t.scenarios.map((id) => words(id, 200)), acceptance: t.acceptance.map((s) => words(s, 1000)) }
  })
  return { version: input.version, targets }
}

export function coverageReport(metadata, contract, sourcePaths) {
  const scenarios = new Map(metadata.scenarios.map((s) => [s.id, s]))
  const reachable = (from, to) => {
    const visited = new Set(), pending = [from]
    while (pending.length) {
      const id = pending.pop()
      if (visited.has(id)) continue
      visited.add(id)
      if (id === to && scenarios.has(to)) return true
      for (const edge of scenarios.get(id)?.edges ?? []) pending.push(edge.destination)
    }
    return false
  }
  const targets = contract.targets.map((t) => {
    const known = t.scenarios.map((id) => scenarios.get(id))
    const implementation = t.component ? sourcePaths.has(t.component.split('#')[0]) ? 'present' : 'missing' : t.scenarios.length ? known.every(Boolean) ? 'present' : 'unknown' : 'planned'
    const preview = !known.length || known.some((s) => !s) ? 'missing' : known.some((s) => s.renderer === 'legacy') ? 'partial' : 'registered'
    const edges = t.scenarios.slice(0, -1).filter((id, i) => !reachable(id, t.scenarios[i + 1]))
    const verification = metadata.validation?.status === 'source-current' && t.scenarios.length && t.scenarios.every((id) => metadata.validation.receipt?.behaviorScenarios?.includes(id)) ? 'scoped receipt' : 'unverified'
    return { ...t, implementation, preview, missingEdges: edges, verification, reason: preview === 'missing' ? 'Expected state has no registered working preview.' : preview === 'partial' ? 'Some expected states are partial specimens.' : t.kind === 'journey' ? edges.length ? 'Expected transitions are not all declared.' : verification === 'scoped receipt' ? 'Scoped local behavior has execution evidence; full acceptance remains unverified.' : 'Declared transitions still need a continuous runtime and execution evidence.' : 'Registered preview still needs execution evidence.' }
  })
  const coveredComponents = new Set(contract.targets.map((t) => t.component))
  const discovered = metadata.surfaces.filter((s) => !s.scenarios.length && !coveredComponents.has(s.id) && !/\/src\/(components|kit|dev|review)\//.test(s.path) && (s.kind === 'sheet' || s.kind === 'route' && !/\/api\/|care-photo|product-lookup|design-preview/.test(s.name)))
    .map((s) => ({ id: `discovered.${createHash('sha256').update(s.id).digest('hex').slice(0, 20)}`, title: s.name, kind: 'screen', component: s.id.startsWith('route:') ? s.path : `${s.path}#${s.name}`, scenarios: [], acceptance: ['Register a real synthetic preview and its entry, exit, cancel and failure paths.'], implementation: 'present', preview: 'missing', missingEdges: [], verification: 'unverified', reason: 'Source-discovered surface has no dedicated working scenario. It may already appear inside a broader specimen.' }))
  return { contractVersion: contract.version, targets: [...targets, ...discovered], limits: ['Source discovery is heuristic, not an exhaustive audit.', 'Expected journeys and future features must be declared; source code cannot reveal unwritten requirements.', 'File presence is not proof of implemented behavior. Generated candidates never satisfy implementation or verification.'] }
}

export function candidateCode(candidate) {
  const content = JSON.stringify({ title: candidate.title, body: candidate.body, action: candidate.action })
  return `import { useState } from 'react'\n\n// Proposal-only synthetic scaffold. Replace with the reviewed adapter before adoption.\nconst content = ${content}\nexport default function RehearsalCandidate() {\n  const [value, setValue] = useState('')\n  const [captured, setCaptured] = useState<string | null>(null)\n  return <section aria-label="Proposal-only screen">\n    <p>Generated proposal · no application writes</p>\n    <h1>{content.title}</h1><p>{content.body}</p>\n    <form onSubmit={(event) => { event.preventDefault(); setCaptured(value) }}>\n      <label>Example input<input value={value} onChange={(event) => setValue(event.target.value)} /></label>\n      <button>{content.action}</button>\n    </form>\n    {captured !== null && <p role="status">Captured locally: {captured || '(empty)'}. No app operation was performed.</p>}\n  </section>\n}\n`
}

/** One local queue owns expectations and candidates; it never mutates application code. */
export async function coverageBridge({ repo, dataDir, metadata, contractFile = repo && join(repo, coveragePath), contractRoot = repo }) {
  const path = join(dataDir, 'coverage-candidates.json')
  let queue = Promise.resolve()
  const serial = (fn) => { const next = queue.then(fn); queue = next.catch(() => {}); return next }
  const read = async () => { try { const value = JSON.parse(await readFile(path, 'utf8')); if (!value || !Number.isInteger(value.version) || !Array.isArray(value.candidates)) fail('Coverage store unreadable', 503); return value } catch (e) { if (e.code === 'ENOENT') return { version: 0, automatic: true, candidates: [] }; throw e } }
  const write = async (store) => { await writeFile(path + '.tmp', JSON.stringify(store, null, 2) + '\n', { mode: 0o600 }); await rename(path + '.tmp', path) }
  const reconcile = async () => {
    const store = await read()
    if (store.automatic) {
      const fresh = metadata.coverage.targets.filter((t) => (t.preview !== 'registered' || t.missingEdges.length || t.verification === 'unverified') && !store.candidates.some((c) => c.id === t.id))
      for (const target of fresh) store.candidates.push({ id: target.id, version: 1, source: metadata.revision.source, title: target.title, body: target.acceptance.join('\n'), action: 'Test proposal', brief: `${target.title}\n\n${target.reason}\nSource: ${metadata.revision.source}\nTarget: ${target.component ?? target.id}\n\n${target.acceptance.map((s) => '- ' + s).join('\n')}\n\nUse synthetic data. Keep this candidate separate from application adoption. Do not infer care permissions or implement external side effects.`, acknowledged: false })
      if (fresh.length) { store.version++; await write(store) }
    }
    return store
  }
  const result = (store) => ({ ...store, source: metadata.revision.source, fixtureSource: metadata.fixtureSource, report: metadata.coverage, candidates: store.candidates.map((c) => ({ ...c, stale: c.source !== metadata.revision.source, targetPresent: metadata.coverage.targets.some((t) => t.id === c.id), code: candidateCode(c) })) })
  return {
    get: () => serial(async () => result(await reconcile())),
    update: (input) => serial(async () => {
      if (!input || input.source !== metadata.revision.source || !Number.isInteger(input.expectedVersion)) fail('Coverage source changed. Refresh before saving.', 409)
      const store = await reconcile()
      if (store.version !== input.expectedVersion) fail('Coverage changed elsewhere. Your draft is retained; refresh before saving.', 409)
      if (input.operation === 'automatic') {
        if (typeof input.enabled !== 'boolean') fail('Invalid generation setting')
        store.automatic = input.enabled
      } else if (input.operation === 'intent') {
        if (!contractFile) fail('Repository bridge unavailable', 503)
        projectPath(contractRoot, relative(contractRoot, contractFile))
        const contract = checkedContract(JSON.parse(await readFile(contractFile, 'utf8')))
        if (input.contractVersion !== contract.version) fail('Expectations changed elsewhere. Refresh first.', 409)
        const target = checkedContract({ version: 1, targets: [input.target] }).targets[0]
        const next = checkedContract({ version: contract.version + 1, targets: [...contract.targets.filter((t) => t.id !== target.id), target] })
        const temporary = `${contractFile}.${randomUUID()}.tmp`
        await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await rename(temporary, contractFile)
        return result(store)
      } else if (input.operation === 'candidate' || input.operation === 'generate') {
        if (input.operation === 'generate' && !store.candidates.some((c) => c.id === input.id)) {
          const target = metadata.coverage.targets.find((t) => t.id === input.id)
          if (!target) fail('Unknown coverage target')
          store.candidates.push({ id: target.id, version: 0, source: input.source, title: target.title, body: target.acceptance.join('\n'), action: 'Test proposal', brief: target.reason, acknowledged: false })
        }
        const c = store.candidates.find((c) => c.id === input.id)
        if (!c || !metadata.coverage.targets.some((t) => t.id === c.id)) fail('Coverage target is no longer current', 409)
        if (input.operation === 'candidate') { c.title = words(input.title, 160); c.body = words(input.body, 4000); c.action = words(input.action, 160) }
        c.version++; c.source = input.source
      } else if (input.operation === 'acknowledge') {
        const c = store.candidates.find((c) => c.id === input.id)
        if (!c) fail('Unknown coverage target')
        c.acknowledged = true
      } else fail('Unknown coverage operation')
      store.version++; await write(store)
      return result(store)
    }),
  }
}
