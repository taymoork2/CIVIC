import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, posix, relative } from 'node:path'
import { parseSync } from 'vite'
import { projectPath } from './review-project.mjs'
import { sourceModuleCandidates } from './review-fixture-hashes.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')
const clean = value => value.replace(/\s+/g, ' ').trim()
const canonical = node => JSON.stringify(node, (key, value) => ['start', 'end', 'raw', 'comments'].includes(key) ? undefined : typeof value === 'bigint' ? `${value}n` : value?.type === 'JSXText' ? { type: 'JSXText', value: clean(value.value) } : value)
const difference = (before, after) => [...after].filter(value => !before.has(value)).sort()
function walk(node, visit, parent, key) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const child of node) walk(child, visit, parent, key); return }
  if (node.type) visit(node, parent, key)
  for (const [name, value] of Object.entries(node)) if (!['start', 'end', 'raw', 'comments'].includes(name)) walk(value, visit, node, name)
}
function bindingNames(node) {
  if (!node) return []
  if (node.type === 'Identifier') return [node.name]
  if (node.type === 'ArrayPattern') return node.elements.flatMap(bindingNames)
  if (node.type === 'ObjectPattern') return node.properties.flatMap(property => bindingNames(property.value ?? property.argument))
  if (node.type === 'AssignmentPattern') return bindingNames(node.left)
  if (node.type === 'RestElement') return bindingNames(node.argument)
  return []
}
function references(node) {
  const names = new Set()
  const visit = (child, bound, parent, key) => {
    if (!child || typeof child !== 'object') return
    if (Array.isArray(child)) { for (const item of child) visit(item, bound, parent, key); return }
    let scope = bound
    if (/Function/.test(child.type) || child.type === 'BlockStatement' || child.type === 'CatchClause' || /^For.*Statement$/.test(child.type)) {
      scope = new Set(bound)
      for (const name of (child.params ?? []).flatMap(bindingNames)) scope.add(name)
      for (const name of bindingNames(child.param)) scope.add(name)
      if (child.id?.name) scope.add(child.id.name)
      for (const declaration of [...(child.body?.type ? [] : child.body ?? []), child.left, child.init].filter(Boolean)) {
        if (declaration.type === 'VariableDeclaration') for (const item of declaration.declarations) for (const name of bindingNames(item.id)) scope.add(name)
        else if (/Declaration$/.test(declaration.type) && declaration.id?.name) scope.add(declaration.id.name)
      }
    }
    if (child.type === 'JSXIdentifier' && parent?.type !== 'JSXAttribute' && /^[A-Z]/.test(child.name) && !scope.has(child.name)) names.add(child.name)
    if (child.type === 'Identifier' && !scope.has(child.name) && key !== 'id' && key !== 'params' && !(key === 'key' && !parent.computed) && !(key === 'property' && !parent.computed)) names.add(child.name)
    for (const [name, value] of Object.entries(child)) if (!['start', 'end', 'raw', 'comments'].includes(name)) visit(value, scope, child, name)
  }
  visit(node, new Set())
  return names
}
function facts(units) {
  const text = new Set(), events = [], styles = []
  for (const [key, unit] of units) {
    if (unit.kind === 'style') styles.push([key, unit.hash])
    if (!unit.node) continue
    walk(unit.node, (node, parent, field) => {
      let value
      if (node.type === 'JSXText') value = node.value
      if (node.type === 'JSXAttribute') {
        if (/^(?:aria-label|placeholder|title|label|alt)$/.test(node.name.name)) value = node.value?.value
        if (/^on[A-Z]/.test(node.name.name)) events.push([key, node.name.name, canonical(node.value)])
        if (['class', 'className', 'style'].includes(node.name.name)) styles.push([key, canonical(node.value)])
      }
      if (node.type === 'Property' && !node.computed && node.key?.name === 'label') value = node.value?.value
      if (node.type === 'Literal' && parent?.type === 'JSXExpressionContainer' && field === 'expression') value = node.value
      if (typeof value === 'string' && clean(value).length > 1) text.add(clean(value).slice(0, 160))
    })
  }
  return { text, events: JSON.stringify(events.sort()), styles: JSON.stringify(styles.sort()) }
}
function excerpt(before = '', after = '') {
  const a = before.split('\n'), b = after.split('\n')
  let start = 0, endA = a.length, endB = b.length
  while (start < endA && start < endB && a[start] === b[start]) start++
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const first = Math.max(0, start - 2)
  const trim = (lines, end) => lines.slice(first, Math.min(end + 2, first + 50)).join('\n').slice(0, 4000)
  return { before: trim(a, endA), after: trim(b, endB), truncated: Math.max(endA, endB) - first > 48 || before.length > 4000 || after.length > 4000 }
}

// Compare the immutable inputs that produced a preview, never today's mutable source checkout.
async function snapshotRoot(project) {
  const build = dirname(project.entry ?? project.manifestPath)
  try {
    const root = projectPath(project.manifestRoot, relative(project.manifestRoot, join(build, 'source')))
    const receipt = JSON.parse(await readFile(join(build, 'receipt.json'), 'utf8'))
    if (receipt.source !== root || !receipt.ui || !receipt.server) return null
    return root
  } catch { return null }
}
function sourceReader(project, root, signal) {
  const cache = new Map(), modules = new Map(), units = new Map(), visited = new Map(), limits = new Set(), packages = new Map(), external = new Set()
  const buildInputs = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', ...project.manifest.sources.map(source => posix.join(posix.dirname(source), 'package.json'))])
  const deadline = Date.now() + 5000
  let bytes = 0
  const check = () => {
    signal?.throwIfAborted()
    if (Date.now() > deadline || units.size >= 2000) throw Error('Source comparison reached its traversal limit.')
  }
  const read = async path => {
    check()
    if (cache.has(path)) return cache.get(path)
    if (cache.size >= 180) throw Error('Source comparison reached its file limit.')
    const file = projectPath(root, path, false), info = await stat(file)
    if (!info.isFile()) throw Object.assign(Error('Not a source file'), { code: 'ENOENT' })
    if (info.size > 500_000 || bytes + info.size > 4_000_000) throw Error('Source comparison reached its size limit.')
    bytes += info.size
    const text = await readFile(file, 'utf8')
    cache.set(path, text)
    return text
  }
  const resolveImport = async (from, specifier, typeOnly = false) => {
    let path
    if (specifier.startsWith('.')) path = posix.normalize(posix.join(posix.dirname(from), specifier))
    else {
      const alias = Object.keys(project.aliases).find(name => specifier === name || specifier.startsWith(name + '/'))
      if (alias) path = posix.join(relative(project.root, project.aliases[alias]), specifier.slice(alias.length))
      else {
        const name = [...packages.keys()].find(name => specifier === name || specifier.startsWith(name + '/'))
        if (!name) {
          const dependency = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
          if (external.has(dependency) || specifier.startsWith('node:') || typeOnly) return null
          throw Error(`An undeclared source import cannot be resolved: ${specifier}`)
        }
        path = posix.join(packages.get(name), specifier === name ? 'src/index' : specifier.slice(name.length + 1))
      }
    }
    path = path.split('?')[0]
    const stems = [path, ...(path.endsWith('.js') ? [path.slice(0, -3)] : [])]
    for (const stem of stems) for (const candidate of sourceModuleCandidates(stem)) {
      try { await read(candidate); return candidate } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error }
    }
    throw Error(`A local dependency is unavailable: ${path}`)
  }
  const visit = async (path, name, direct = false, probe = false) => {
    const identity = `${path}#${name}`
    if (visited.has(identity)) return visited.get(identity) === true
    visited.set(identity, 'pending')
    const code = await read(path)
    if (!/\.[cm]?[jt]sx?$/.test(path)) { units.set(path, { file: path, name: 'Shared styles or asset', code, hash: sha(code), kind: path.endsWith('.css') ? 'style' : 'dependency' }); visited.set(identity, true); return true }
    if (!modules.has(path)) {
      const parsed = parseSync(path, code)
      if (parsed.errors.length) throw Error(`Source could not be parsed: ${path}`)
      const declarations = new Map(), exports = new Map(), imports = new Map(), stars = [], effects = []
      const declare = node => {
        if (!node) return []
        const names = []
        if (node.type === 'VariableDeclaration') for (const item of node.declarations) {
          for (const name of bindingNames(item.id)) { declarations.set(name, item); names.push(name) }
        }
        else if (node.id?.name) { declarations.set(node.id.name, node); names.push(node.id.name) }
        return names
      }
      for (const statement of parsed.program.body) {
        if (statement.type === 'ImportDeclaration') {
          if (!statement.specifiers.length) effects.push({ source: statement.source.value })
          for (const item of statement.specifiers) imports.set(item.local.name, { source: statement.source.value, name: item.type === 'ImportDefaultSpecifier' ? 'default' : item.type === 'ImportNamespaceSpecifier' ? '*' : item.imported.name ?? item.imported.value, typeOnly: statement.importKind === 'type' || item.importKind === 'type' })
        } else if (statement.type === 'ExportNamedDeclaration') {
          for (const name of declare(statement.declaration)) exports.set(name, { name })
          for (const item of statement.specifiers) exports.set(item.exported.name ?? item.exported.value, { name: item.local.name ?? item.local.value, source: statement.source?.value })
        } else if (statement.type === 'ExportDefaultDeclaration') {
          const node = statement.declaration
          if (node.type === 'Identifier') exports.set('default', { name: node.name })
          else { declarations.set(node.id?.name ?? 'default', node); exports.set('default', { name: node.id?.name ?? 'default' }) }
        } else if (statement.type === 'ExportAllDeclaration') stars.push(statement.source.value)
        else { declare(statement); if (statement.type === 'ExpressionStatement') effects.push({ node: statement }) }
      }
      modules.set(path, { declarations, exports, imports, stars, effects })
    }
    const { declarations, exports, imports, stars, effects } = modules.get(path)
    const follow = async (item, probe = false) => {
      const dependency = await resolveImport(path, item.source, item.typeOnly)
      if (dependency) return visit(dependency, item.name ?? '*', false, probe)
      return true
    }
    const local = async (name, direct = false) => {
      check()
      const key = `${path}#${name}`
      if (units.has(key)) return true
      const node = declarations.get(name)
      if (!node) return imports.has(name) ? follow(imports.get(name)) : false
      units.set(key, { file: path, name, code: code.slice(node.start, node.end), hash: sha(canonical(node)), node, kind: direct ? 'selected' : 'dependency' })
      for (const ref of references(node)) {
        if (declarations.has(ref)) await local(ref)
        else if (imports.has(ref)) await follow(imports.get(ref))
      }
      const dynamic = []
      walk(node, child => {
        if (child.type !== 'ImportExpression') return
        if (typeof child.source?.value !== 'string') throw Error(`A dynamic source dependency cannot be resolved: ${path}`)
        dynamic.push(child.source.value)
      })
      for (const source of dynamic) await follow({ source, name: '*' })
      return true
    }
    const binding = exports.get(name)
    if (name === '*') for (const exported of exports.keys()) await visit(path, exported)
    else if (binding) {
      const found = binding.source ? await follow(binding, probe) : await local(binding.name, direct)
      if (!found) { visited.set(identity, false); if (probe) return false; throw Error(`The registered export is unavailable: ${path}#${name}`) }
    }
    else {
      let found = false
      for (const source of stars) if (await follow({ source, name }, true)) { found = true; break }
      if (!found) {
        visited.set(identity, false)
        if (probe) return false
        throw Error(`The registered export is unavailable: ${path}#${name}`)
      }
    }
    for (const [index, effect] of effects.entries()) {
      if (effect.source) await follow(effect)
      else {
        const node = effect.node, key = `${path}#initialization-${index}`
        units.set(key, { file: path, name: 'Module initialization', code: code.slice(node.start, node.end), hash: sha(canonical(node)), node, kind: 'dependency' })
        for (const ref of references(node)) if (declarations.has(ref)) await local(ref); else if (imports.has(ref)) await follow(imports.get(ref))
      }
    }
    visited.set(identity, true)
    return true
  }
  return async scenario => {
    try {
      for (const path of [...buildInputs].filter(path => path.endsWith('package.json'))) {
        try {
          const value = JSON.parse(await read(path))
          if (value.name) packages.set(value.name, posix.dirname(path))
          for (const name of Object.keys({ ...value.dependencies, ...value.devDependencies, ...value.peerDependencies })) external.add(name)
        } catch (error) { if (error.code !== 'ENOENT') throw error }
      }
      if (!scenario.component || !scenario.componentExport) throw Error('No source export is bound to this preview.')
      await visit(scenario.component, scenario.componentExport, true)
      let count = 0
      const sharedStyles = async folder => {
        for (const item of await readdir(projectPath(root, folder), { withFileTypes: true })) {
          if (++count > 3000) throw Error('Shared-style comparison reached its file limit.')
          if (item.name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(item.name)) continue
          const path = posix.join(folder, item.name)
          if (item.isDirectory()) await sharedStyles(path)
          else if (item.isFile() && item.name.endsWith('.css')) await visit(path, '*')
        }
      }
      for (const source of project.manifest.sources) await sharedStyles(source)
      for (const path of buildInputs) {
        try { const code = await read(path); units.set(path, { file: path, name: 'Build inputs', kind: 'build', code, hash: sha(code) }) }
        catch (error) { if (error.code !== 'ENOENT') throw error }
      }
    } catch (error) { if (signal?.aborted) throw error; limits.add(error.message) }
    return { units, limits: [...limits] }
  }
}
const family = (rows, screen) => rows.filter(row => screen.targetId ? row.targetId === screen.targetId : screen.componentId ? row.componentId === screen.componentId : row.id === screen.id)
function metadataChanges(before, after, a, b) {
  const state = row => clean(String(row.fixture?.state ?? row.fixture?.name ?? row.label))
  const statesA = new Set(family(before, a).map(state)), statesB = new Set(family(after, b).map(state))
  const actions = (rows, screen) => new Set((screen.edges ?? []).map(edge => `${edge.action} → ${rows.find(row => row.id === edge.destination)?.label ?? edge.destination}`))
  const actionsA = actions(before, a), actionsB = actions(after, b)
  return { states: { added: difference(statesA, statesB), removed: difference(statesB, statesA) }, actions: { added: difference(actionsA, actionsB), removed: difference(actionsB, actionsA) }, fixtureChanged: canonical(a.fixture) !== canonical(b.fixture) || canonical(a.captureFields) !== canonical(b.captureFields) || a.route !== b.route }
}

export async function compareVersionScreens(base, candidate, baseRows, candidateRows, scenario, otherScenario, signal) {
  signal?.throwIfAborted()
  const a = baseRows.find(row => row.id === scenario), b = candidateRows.find(row => row.id === otherScenario)
  if (!a || !b) throw Object.assign(Error('Unknown registered comparison screen'), { status: 400 })
  const matches = a.targetId ? a.targetId === b.targetId : a.componentId ? a.componentId === b.componentId : a.route ? a.route === b.route : a.id === b.id && a.component === b.component
  if (!matches) throw Object.assign(Error('Choose versions of the same registered screen or component'), { status: 400 })
  const metadata = metadataChanges(baseRows, candidateRows, a, b)
  const roots = await Promise.all([snapshotRoot(base), snapshotRoot(candidate)])
  const graphs = await Promise.all(roots.map((root, index) => root ? sourceReader(index ? candidate : base, root, signal)(index ? b : a) : { units: new Map(), limits: ['Built source snapshot unavailable; current checkout files are not a verified substitute.'] }))
  const limits = [...new Set(graphs.flatMap(graph => graph.limits))]
  const changed = []
  let text = { added: [], removed: [], totalAdded: 0, totalRemoved: 0 }, stylesChanged = false, eventsChanged = false
  if (!limits.length) {
    for (const key of new Set([...graphs[0].units.keys(), ...graphs[1].units.keys()])) {
      const before = graphs[0].units.get(key), after = graphs[1].units.get(key)
      if (before?.hash === after?.hash) continue
      const unit = after ?? before
      changed.push({ file: unit.file, name: unit.name, kind: unit.kind, change: !before ? 'added' : !after ? 'removed' : 'changed', ...excerpt(before?.code, after?.code) })
    }
    const left = facts(graphs[0].units), right = facts(graphs[1].units)
    const added = difference(left.text, right.text), removed = difference(right.text, left.text)
    text = { added: added.slice(0, 20), removed: removed.slice(0, 20), totalAdded: added.length, totalRemoved: removed.length }
    stylesChanged = left.styles !== right.styles; eventsChanged = left.events !== right.events
  }
  const hasMetadata = metadata.fixtureChanged || Object.values(metadata.states).some(rows => rows.length) || Object.values(metadata.actions).some(rows => rows.length)
  const status = changed.length || hasMetadata ? 'changed' : limits.length ? 'unavailable' : 'same'
  let summary = limits.length ? 'Source comparison unavailable' : 'No scoped UI code or state changes'
  if (text.totalAdded) summary = `Added “${text.added[0]}”${text.totalAdded > 1 ? ` +${text.totalAdded - 1} labels` : ''}`
  else if (changed.some(unit => unit.kind === 'selected')) summary = `${a.label} code changed`
  else if (changed.some(unit => unit.kind === 'dependency')) summary = `${changed.find(unit => unit.kind === 'dependency').name} changed`
  else if (stylesChanged) summary = 'Shared styles changed'
  else if (metadata.states.added.length) summary = `State added: ${metadata.states.added[0]}`
  else if (metadata.states.removed.length) summary = `State removed: ${metadata.states.removed[0]}`
  else if (hasMetadata) summary = 'Preview state or declared actions changed'
  else if (changed.length) summary = 'UI code matches · build inputs differ'
  return { status, summary, ...metadata, text, stylesChanged, eventsChanged, changes: changed.slice(0, 20), totalChanges: changed.length, limits, basis: 'Built source and declared scenarios; visual and runtime behavior are not verified by this comparison.' }
}
