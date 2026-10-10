import { createRequire } from 'node:module'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative, extname } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

// Source evidence complements captured DOM text; string candidates are not render proof.
const require = createRequire(import.meta.url)
const { parse } = createRequire(require.resolve('@vitejs/plugin-react'))('@babel/parser')
const root = resolve(import.meta.dirname, '../../..')
const sourceRoot = resolve(root, 'apps/web/src')
const output = resolve(root, 'docs/audits/2026-10-05-app-experience')
mkdirSync(output, { recursive: true })
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = resolve(path, entry.name)
    return entry.isDirectory() ? files(next) : /\.[cm]?[jt]sx?$/.test(next) ? [next] : []
  })
}
function visit(node, fn, parent) {
  if (node === null || typeof node !== 'object') return
  if (typeof node.type === 'string') fn(node, parent)
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue
    if (Array.isArray(value)) value.forEach((child) => visit(child, fn, node))
    else if (value && typeof value === 'object') visit(value, fn, node)
  }
}
const records = []
for (const file of files(sourceRoot).filter((file) => !/\.test\.|\/test\//.test(file))) {
  const source = readFileSync(file, 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const record = { file: relative(root, file), sha256: createHash('sha256').update(source).digest('hex'), imports: [], routes: [], links: [], textCandidates: [], states: [], previewScreens: [] }
  const at = (node) => ({ line: node.loc.start.line, expression: source.slice(node.start, node.end) })
  visit(ast, (node, parent) => {
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source?.value.startsWith('.')) {
      const stem = resolve(dirname(file), node.source.value)
      const imported = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'].map((suffix) => stem + suffix).find((name) => { try { return readFileSync(name).length >= 0 } catch { return false } })
      if (imported?.startsWith(sourceRoot)) record.imports.push(relative(root, imported))
    }
    if (node.type === 'CallExpression' && node.callee.name === 'createFileRoute') record.routes.push(node.arguments[0]?.value)
    if (node.type === 'JSXAttribute' && ['to', 'href', 'onClick', 'onBack', 'onClose', 'onDone', 'onOpen'].includes(node.name.name)) record.links.push({ kind: node.name.name, ...at(node) })
    if (node.type === 'CallExpression' && /^(navigate|redirect|set[A-Z]\w*)$/.test(node.callee.name ?? '')) record.states.push({ kind: node.callee.name, ...at(node) })
    if (node.type === 'ObjectProperty' && ['to', 'href'].includes(node.key.name ?? node.key.value)) record.links.push({ kind: node.key.name ?? node.key.value, ...at(node) })
    if (node.type === 'JSXText' && node.value.trim()) record.textCandidates.push({ kind: 'jsx', text: node.value.trim().replace(/\s+/g, ' '), ...at(node) })
    if (node.type === 'StringLiteral' && !['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'TSLiteralType', 'ObjectProperty'].includes(parent?.type) && /[a-zA-Z]/.test(node.value) && (node.value.includes(' ') || /^[A-Z]/.test(node.value)) && !/ClassName|className/.test(source.slice(Math.max(0, node.start - 50), node.start))) record.textCandidates.push({ kind: 'literal-candidate', text: node.value, ...at(node) })
    if (node.type === 'StringLiteral' && parent?.type === 'ObjectProperty' && parent.value === node && /\/copy(?:\/[^/]+|-[^/]*)?\.ts$/.test(file)) record.textCandidates.push({ kind: 'copy-value', text: node.value, ...at(node) })
    if (node.type === 'TemplateLiteral' && node.quasis.some((part) => /[A-Za-z].*\s|\s.*[A-Za-z]/.test(part.value.raw))) record.textCandidates.push({ kind: 'template-candidate', text: source.slice(node.start, node.end), ...at(node) })
    if (file.endsWith('/routes/design-preview.tsx')) {
      if (node.type === 'BinaryExpression' && node.operator === '===' && node.left.name === 'screen' && node.right.type === 'StringLiteral') record.previewScreens.push(node.right.value)
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'includes' && node.arguments[0]?.name === 'screen' && node.callee.object.type === 'ArrayExpression') record.previewScreens.push(...node.callee.object.elements.map((entry) => entry.value))
      if (node.type === 'VariableDeclarator' && node.id.name === 'samples') record.previewScreens.push(...node.init.properties.map((entry) => entry.key.value ?? entry.key.name))
    }
  })
  records.push(record)
}
const byFile = new Map(records.map((record) => [record.file, record]))
function closure(start, visited = new Set()) {
  if (visited.has(start)) return visited
  visited.add(start)
  for (const imported of byFile.get(start)?.imports ?? []) closure(imported, visited)
  return visited
}
const routes = records.filter((record) => record.routes.length).map((record) => ({
  path: record.routes[0], file: record.file, sourceClosure: [...closure(record.file)].sort(),
  directLinks: record.links, directTransitions: record.states,
}))
const manifest = { capturedAt: new Date().toISOString(), evidence: 'working-source; includes pending intake corrections; hashes bind this scan', caveat: 'Import closure is conservative. Text candidates may be hidden, technical, dev-only, or unreachable. Rendered snapshots are separate evidence.', routes, files: records, previewScreens: [...new Set(records.flatMap((record) => record.previewScreens))].sort() }
assert(routes.some((route) => route.path === '/laundry') && routes.some((route) => route.path === '/closet'), 'Core routes must be indexed')
assert(byFile.get('apps/web/src/closet/add-clothes.tsx')?.links.some((link) => link.kind === 'onClose'), 'Drawer callbacks must be indexed')
assert(byFile.get('apps/web/src/copy/shared.ts')?.textCandidates.some((candidate) => candidate.kind === 'copy-value'), 'Shared copy must be indexed')
writeFileSync(resolve(output, 'source-map.json'), JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(resolve(output, 'copy-candidates.tsv'), 'file\tline\tkind\ttext\n' + records.flatMap((record) => record.textCandidates.map((text) => [record.file, text.line, text.kind, JSON.stringify(text.text)].join('\t'))).join('\n') + '\n')
writeFileSync(resolve(output, 'interaction-inventory.tsv'), 'file\tline\tkind\texpression\n' + records.flatMap((record) => [...record.links, ...record.states].map((entry) => [record.file, entry.line, entry.kind, entry.expression.replace(/[\t\n\r]/g, ' ')].join('\t'))).join('\n') + '\n')
writeFileSync(resolve(output, 'route-inventory.md'), '# Route inventory\n\nGenerated from source. Route presence does not establish a working journey.\n\n| Route | Source | Imported source files | Direct navigation/action expressions |\n| --- | --- | ---: | ---: |\n' + routes.map((route) => `| ${route.path} | [${route.file}](/Users/taymoor/Projects/laundry-app/${route.file}) | ${route.sourceClosure.length} | ${route.directLinks.length + route.directTransitions.length} |`).join('\n') + '\n')
console.log(JSON.stringify({ routes: routes.length, sourceFiles: records.length, textCandidates: records.reduce((n, record) => n + record.textCandidates.length, 0), previewScreens: manifest.previewScreens.length, output }))
