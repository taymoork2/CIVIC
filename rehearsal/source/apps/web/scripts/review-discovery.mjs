import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, extname, posix, relative } from 'node:path'
import { projectPath } from './review-project.mjs'

const sha = (value) => createHash('sha256').update(value).digest('hex')
const words = (value) => value.replace(/<[^>]*>|\{[^}]*\}/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 160)
const route = (path) => ('/' + path.replace(/\.(?:html?|[jt]sx?)$/, '').replace(/(?:^|\/)index$/, '')).replace(/\/$/, '') || '/'
export function linkDestination(from, href, candidates) {
  if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return null
  const path = href.split(/[?#]/)[0]
  const file = path.startsWith('/') ? path.slice(1) : posix.normalize(posix.join(posix.dirname(from.file), path))
  return candidates.find((row) => row.file === file || row.route === route(path.startsWith('/') ? path.slice(1) : file))?.id ?? null
}

// Source findings are candidates. No app module is imported or executed during scanning.
export async function discoverScreens(root, source) {
  const base = projectPath(root, source)
  const candidates = [], hashes = [], links = []
  let count = 0, bytes = 0, truncated = false
  async function walk(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', '.git', '.review-data', 'dist', 'build', 'coverage', '__tests__', 'api'].includes(entry.name) || entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const file = posix.join(folder, entry.name)
      if (entry.isDirectory()) { await walk(file); continue }
      if (!entry.isFile() || !/\.(?:html?|[jt]sx?|css)$/.test(entry.name) || /\.(?:test|spec|d)\./.test(entry.name)) continue
      if (++count > 1000 || bytes > 8_000_000 || candidates.length >= 150) { truncated = true; return }
      const path = relative(root, file), checked = projectPath(root, path), metadata = await stat(checked)
      if (metadata.size > 500_000) { truncated = true; hashes.push([path, sha(`${metadata.size}:${metadata.mtimeMs}`)]); continue }
      if (bytes + metadata.size > 8_000_000) { truncated = true; return }
      const code = await readFile(checked, 'utf8')
      bytes += Buffer.byteLength(code); hashes.push([path, sha(code)])
      if (code.length > 500_000 || extname(path) === '.css') continue
      const fields = [...new Set([...code.matchAll(/aria-label\s*=\s*["']([^"']+)["']/g), ...code.matchAll(/<label\b[^>]*>\s*([^<{}]+)/g)].map((match) => words(match[1])).filter((label) => label && !/password|secret|token|credential/i.test(label)))].slice(0, 100)
      const refs = [...code.matchAll(/<(a|Link)\b[^>]*\b(?:href|to)\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:a|Link)>/g)].map((match) => ({ href: match[2], action: words(match[3]) || 'Open link' }))
      for (const match of code.matchAll(/<form\b[^>]*\baction\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/g)) refs.push({ href: match[1], action: words(/<button\b[^>]*>([\s\S]*?)<\/button>/.exec(match[2])?.[1] ?? 'Submit form') })
      const html = /\.html?$/.test(path)
      const exports = html ? [{ name: '', kind: 'html' }] : [...code.matchAll(/export\s+(default\s+)?(?:async\s+)?function\s+([A-Z][\w]*)\s*\(|export\s+(?:const|let)\s+([A-Z][\w]*)\s*=/g)].map((match) => ({ name: match[1] ? 'default' : match[2] ?? match[3], kind: 'react' }))
      if (!html && /export\s+default\s+(?:function\s*\(|\(?\s*\w*\s*\)?\s*=>)/.test(code)) exports.push({ name: 'default', kind: 'react' })
      const pageRoute = /createFileRoute\(\s*["']([^"']+)["']\s*\)/.exec(code)?.[1]
      if (pageRoute && !exports.length) exports.push({ name: 'Route', kind: 'react' })
      for (const exported of exports) {
        if (!html && !/<[A-Za-z][\w.-]*(?:\s|>|\/)/.test(code)) continue
        const id = `screen.${sha(path + '#' + exported.name).slice(0, 16)}`
        const needsContext = !html && /createFileRoute|createRoute\(|use(?:Query|Mutation|Router|Navigate|Auth|Session|Context)\b|from\s*["'](?:next\/|convex\/|@tanstack\/react-router)/.test(code)
        const label = html ? words(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(code)?.[1] ?? /<title>([\s\S]*?)<\/title>/.exec(code)?.[1] ?? entry.name) : exported.name === 'default' ? entry.name.replace(/\.[^.]+$/, '') : exported.name
        const row = { id, file: path, export: exported.name, kind: exported.kind, label, route: pageRoute ?? route(relative(base, file)), captureFields: fields, available: !needsContext, reason: needsContext ? 'Needs router, auth or data context; use a project adapter.' : html && /<script\b|\bon\w+\s*=/.test(code) ? 'Source markup and native forms; app scripts are not executed.' : 'Isolated screen candidate; confirm props and test its preview.' }
        if (!candidates.some((prior) => prior.id === id)) { candidates.push(row); links.push(...refs.map((ref) => ({ from: id, ...ref }))) }
      }
    }
  }
  await walk(base)
  candidates.sort((a, b) => Number(b.route === '/') - Number(a.route === '/') || a.file.localeCompare(b.file) || a.export.localeCompare(b.export))
  const edges = [], unmapped = []
  for (const link of links) {
    const from = candidates.find((row) => row.id === link.from)
    const destination = linkDestination(from, link.href, candidates)
    if (destination && destination !== link.from) {
      if (!edges.some((edge) => edge.from === link.from && edge.to === destination && edge.action === link.action)) edges.push({ from: link.from, to: destination, action: link.action, when: '', returnTo: /^back|return|cancel/i.test(link.action) ? from.label : '' })
    } else if (!destination) unmapped.push({ ...link, reason: 'No local destination confirmed' })
  }
  return { sourceHash: sha(JSON.stringify(hashes)), candidates, edges, unmapped, scanned: Math.min(count, 1000), truncated, limits: ['Heuristic source discovery; hidden states and runtime-only conditions need confirmation.', 'Generated navigation is synthetic. Production scripts, APIs, auth and writes are not connected.'] }
}

export function generatedScenarios(discovery, input) {
  const bad = (message) => { throw Object.assign(Error(message), { status: 400 }) }
  if (!Array.isArray(input.selected) || !input.selected.length || input.selected.length > 100 || new Set(input.selected).size !== input.selected.length) bad('Select 1–100 unique isolated screens')
  const selected = input.selected.map((id) => discovery.candidates.find((row) => row.id === id))
  if (selected.some((row) => !row?.available)) bad('A selected screen needs a project-specific adapter')
  const ids = new Set(input.selected)
  if (input.overrides !== undefined && (!input.overrides || typeof input.overrides !== 'object' || Array.isArray(input.overrides) || Object.keys(input.overrides).some((key) => !ids.has(key)))) bad('Screen setup must refer to selected candidates')
  if (!Array.isArray(input.edges) || input.edges.length > 300) bad('Invalid selected paths')
  const edges = input.edges.map((edge) => {
    if (!edge || !ids.has(edge.from) || !ids.has(edge.to) || typeof edge.action !== 'string' || !edge.action.trim() || edge.action.length > 160 || ['when', 'returnTo'].some((key) => edge[key] !== undefined && (typeof edge[key] !== 'string' || edge[key].length > 1000))) bad('Use selected screens and a named action for each path')
    return { ...edge, action: edge.action.trim() }
  })
  if (new Set(edges.map((edge) => edge.from + ':' + edge.action)).size !== edges.length) bad('An action must have one destination; use distinct action labels for branches')
  const journey = typeof input.journey === 'string' && input.journey.trim() && input.journey.length <= 120 ? input.journey.trim() : 'Discovered journey'
  return selected.map((row) => {
    const edit = input.overrides?.[row.id] ?? {}
    if (edit.props !== undefined && (!edit.props || typeof edit.props !== 'object' || Array.isArray(edit.props) || JSON.stringify(edit.props).length > 20_000)) bad('Preview props must be a JSON object, up to 20KB')
    const fields = edit.captureFields ?? row.captureFields
    if (!Array.isArray(fields) || fields.length > 100 || fields.some((s) => typeof s !== 'string' || !s.trim() || s.length > 160 || /password|secret|token|credential/i.test(s))) bad('Capture fields must be non-secret accessible labels')
    const label = edit.label ?? row.label
    if (typeof label !== 'string' || !label.trim() || label.length > 160) bad('Use a screen name, up to 160 characters')
    const forward = edges.filter((edge) => input.selected.indexOf(edge.to) > input.selected.indexOf(edge.from))
    const incoming = forward.find((edge) => edge.to === row.id && forward.filter((other) => other.from === edge.from).length > 1 && forward.find((other) => other.from === edge.from).to !== row.id)
    return { id: row.id, label: label.trim(), journey, section: 'Main', component: row.file, captureFields: fields, fixture: { props: edit.props ?? {} }, ...(incoming ? { branchOf: incoming.from } : {}), edges: edges.filter((edge) => edge.from === row.id).map((edge) => ({ action: edge.action, destination: edge.to, ...(edge.when ? { when: edge.when } : {}), ...(edge.returnTo ? { returnTo: edge.returnTo } : {}) })), discovery: { route: row.route, kind: row.kind, export: row.export, evidence: 'source candidate; synthetic navigation; behavior unverified' } }
  }).map((row, _index, rows) => rows.find((parent) => parent.id === row.branchOf)?.branchOf ? { ...row, branchOf: undefined } : row)
}
