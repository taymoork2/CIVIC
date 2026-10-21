import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

const exec = promisify(execFile)
const run = async (command, args, cwd) => (await exec(command, args, { cwd, timeout: 5000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GH_PROMPT_DISABLED: '1', ...(command === 'gh' ? { GH_HOST: 'github.com' } : {}) } })).stdout.trim()
const git = (root, args) => run('git', ['-C', root, ...args])
const date = value => typeof value === 'string' && value.length <= 100 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
export async function gitHistory(root, revision, command = git) {
  const history = { kind: 'code', status: 'unknown' }
  if (!/^[a-f0-9]{7,40}$/i.test(revision ?? '')) return history
  try {
    const [head, base, common, remote, updatedAt, shallow] = await Promise.all([
      command(root, ['rev-parse', '--verify', `${revision}^{commit}`]),
      command(root, ['rev-parse', '--verify', 'refs/heads/main']).catch(() => ''),
      command(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
      command(root, ['remote', 'get-url', 'origin']).catch(() => ''),
      command(root, ['show', '-s', '--format=%cI', revision]),
      command(root, ['rev-parse', '--is-shallow-repository']),
    ])
    if (!/^[a-f0-9]{40}$/i.test(head)) return history
    const namespace = githubRepository(remote) ?? createHash('sha256').update(common).digest('hex')
    Object.assign(history, { key: `git:${namespace}:${head}`, revision: head, updatedAt: date(updatedAt) })
    if (!/^[a-f0-9]{40}$/i.test(base) || shallow !== 'false') return history
    const counts = await command(root, ['rev-list', '--left-right', '--count', `${base}...${head}`])
    if (!/^\d+\s+\d+$/.test(counts)) return history
    const [behind, ahead] = counts.split(/\s+/).map(Number)
    if (![ahead, behind].every(Number.isSafeInteger)) return history
    Object.assign(history, { baseKey: `git:${namespace}:${base}`, ahead, behind, status: ahead ? behind ? 'diverged' : 'ahead' : behind ? 'included' : 'same' })
    if (ahead && behind) {
      const shared = await command(root, ['merge-base', base, head]).catch(() => '')
      if (/^[a-f0-9]{40}$/i.test(shared)) history.sharedBase = shared
    }
  } catch { /* Missing Git objects stay unknown; a preview is not proof of ancestry. */ }
  return history
}
export function githubRepository(remote = '') {
  return /^(?:git@github\.com:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote)?.[1] ?? null
}
export function figmaFile(input) {
  let url
  try { url = new URL(input) } catch { throw Error('Use a Figma file link') }
  const key = /^\/(?:design|file)\/([a-zA-Z0-9]+)(?:\/|$)/.exec(url.pathname)?.[1]
  if (url.protocol !== 'https:' || url.hostname !== 'www.figma.com' && url.hostname !== 'figma.com' || url.username || url.password || url.port || !key) throw Error('Use an HTTPS figma.com/design/… or figma.com/file/… link')
  return { key, url: `https://www.figma.com/design/${key}` }
}
export function sourcePage(items, { query = '', inactive = false, offset = 0 } = {}) {
  if (typeof query !== 'string' || query.length > 120 || typeof inactive !== 'boolean' || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw Object.assign(Error('Invalid source search'), { status: 400 })
  const needle = query.trim().toLowerCase()
  const matches = items.filter(row => (inactive || row.active !== false) && [row.title, row.detail, row.branch, row.path].filter(Boolean).join(' ').toLowerCase().includes(needle))
    .sort((a, b) => Number(b.connected) - Number(a.connected) || Number(b.dirty) - Number(a.dirty) || String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')) || a.title.localeCompare(b.title))
  const unique = [...new Map(matches.map(row => [row.id, row])).values()]
  offset = Math.min(offset, Math.max(0, Math.floor((unique.length - 1) / 10) * 10))
  return { items: unique.slice(offset, offset + 10), total: unique.length, hiddenInactive: items.filter(row => row.active === false).length, offset, limit: 10, hasMore: offset + 10 < unique.length }
}
export async function previewVersion(project, kind) {
  let receipt = {}, checkout = false
  try { receipt = JSON.parse(await readFile(join(project.manifestRoot, 'receipt.json'), 'utf8')) }
  catch (error) { checkout = error.code === 'ENOENT' && kind === 'implementation' }
  // Source checkouts have no build receipt; running instances must keep their recorded revision.
  if (checkout) {
    try {
      if (await realpath(await git(project.root, ['rev-parse', '--show-toplevel'])) !== await realpath(project.root)) throw Error('Not a source checkout')
      receipt = { source: project.root, sourceHead: await git(project.root, ['rev-parse', 'HEAD']), dirty: Boolean(await git(project.root, ['status', '--porcelain'])) }
    } catch { checkout = false }
  }
  const revision = String(receipt.ui ?? receipt.sourceHead ?? '').slice(0, 8)
  let branch
  if (!receipt.worktreeName && kind !== 'design') try { branch = await git(project.root, ['symbolic-ref', '--short', '-q', 'HEAD']) } catch {}
  const name = kind === 'design' ? `${project.manifest.design?.id ?? project.manifest.name}${receipt.capturedAt ? ` · ${receipt.capturedAt.slice(0, 10)}` : ''}`
    : receipt.worktreeName?.trim() || (kind === 'live' ? 'Running build' : kind === 'isolated' ? 'Test copy' : checkout && branch === 'main' ? 'Main' : branch || (checkout ? 'Detached checkout' : project.root.split('/').at(-1)))
  const sourceName = `${name}${receipt.dirty ? ' · edited' : ''}${revision && kind !== 'design' ? ` · ${revision}` : ''}`
  let id = null
  // A commit alone cannot identify local edits or a running build. Require a recorded content identity.
  if (kind !== 'design' && [receipt.ui, receipt.server, receipt.script].every(value => typeof value === 'string' && value) && Array.isArray(receipt.css) && receipt.css.every(value => typeof value === 'string')) {
    const source = await realpath(receipt.source ?? project.root).catch(() => project.root)
    const namespace = receipt.worktreeHash ? await git(source, ['rev-parse', '--path-format=absolute', '--git-common-dir']).catch(() => source) : source
    id = createHash('sha256').update(JSON.stringify([namespace, receipt.worktreeHash ?? null, receipt.ui, receipt.server, receipt.script, [...receipt.css].sort()])).digest('hex')
  }
  const title = receipt.worktreeName?.trim().replace(/^Draft [a-z] · /i, '') || name
  const main = receipt.worktreeName === 'Main' || checkout && branch === 'main'
  const versionName = kind === 'live' ? 'Running app' : main ? 'Main branch' : title[0]?.toUpperCase() + title.slice(1)
  const description = kind === 'design' ? 'Design reference' : kind === 'live' ? 'Currently running · read only' : main ? 'Preview of local main' : receipt.worktreeName || checkout ? 'Branch draft' : kind === 'isolated' ? 'Isolated test copy' : 'Local code preview'
  const history = kind === 'design' ? { kind: 'design', status: 'reference' } : await gitHistory(receipt.source ?? project.root, receipt.ui ?? receipt.sourceHead)
  history.capturedAt = date(receipt.builtAt ?? receipt.capturedAt)
  history.main = main && history.status === 'same'
  return { sourceName, version: { id, name: versionName, description, kind: kind === 'design' ? 'design' : 'implementation', history } }
}
export async function gitSources(root, source, connectedRoots, command = git, query = '', { paths } = {}) {
  const base = await command(root, ['rev-parse', '--verify', 'refs/heads/main']).catch(() => command(root, ['rev-parse', '--verify', 'HEAD']))
  const blocks = (await command(root, ['worktree', 'list', '--porcelain', '-z'])).split('\0\0').filter(Boolean)
  const trees = blocks.map(block => Object.fromEntries(block.split('\0').filter(Boolean).map(line => { const i = line.indexOf(' '); return i < 0 ? [line, true] : [line.slice(0, i), line.slice(i + 1)] }))).filter(tree => !paths || paths.includes(tree.worktree))
  const needle = query.trim().toLowerCase(), matches = tree => `${tree.branch ?? ''} ${tree.worktree}`.toLowerCase().includes(needle)
  if (needle) trees.sort((a, b) => Number(matches(b)) - Number(matches(a)))
  const items = []
  const deadline = Date.now() + 10000
  let limited = false
  // Keep every source searchable; bound expensive status inspection, prioritizing the search.
  for (let start = 0; start < trees.length; start += 4) await Promise.all(trees.slice(start, start + 4).map(async tree => {
    const branch = tree.branch?.replace(/^refs\/heads\//, '') ?? null
    let dirty = false, ahead = 0, unknown = false, updatedAt = ''
    try {
      if (Date.now() >= deadline) { limited = true; throw Error('Status inspection budget reached') }
      const result = await Promise.all([command(tree.worktree, ['status', '--porcelain', '--untracked-files=normal']), command(root, ['rev-list', '--count', `${base}..${tree.HEAD}`]), command(root, ['show', '-s', '--format=%cI', tree.HEAD])])
      dirty = Boolean(result[0]); ahead = Number(result[1]); updatedAt = result[2]
    } catch { unknown = true }
    const connected = connectedRoots.has(tree.worktree)
    items.push({ id: `worktree:${tree.worktree}`, type: 'worktree', title: branch ?? (connected ? 'Installed app source' : dirty ? `Uncommitted work · ${tree.worktree.split('/').at(-2)}` : `Detached checkout · ${tree.HEAD.slice(0, 8)}`), detail: unknown ? 'Status unavailable' : dirty ? 'Uncommitted changes' : 'Clean checkout', path: tree.worktree, source, branch, revision: tree.HEAD, updatedAt, dirty, connected, active: unknown || connected || dirty || ahead > 0 || branch === 'main' })
  }))
  if (paths) return { items, limited }
  const branches = await command(root, ['for-each-ref', `--no-merged=${base}`, '--sort=-committerdate', '--format=%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)', 'refs/heads']).catch(() => '')
  for (const line of branches.split('\n').filter(Boolean)) {
    const [branch, revision, updatedAt] = line.split('\0')
    if (!items.some(row => row.branch === branch)) items.push({ id: `branch:${root}:${branch}`, type: 'branch', title: branch, branch, revision, updatedAt, detail: 'Unmerged branch · no local worktree', active: Date.parse(updatedAt) >= Date.now() - 30 * 86400000 })
  }
  return { items, limited }
}
async function figmaSources(link, token, fetcher) {
  if (!token) return { items: [{ id: `figma:${link.key}`, type: 'figma', title: 'Linked Figma file', url: link.url, detail: 'Connect Figma access on the CIVIC host to discover frames and branches.' }], unavailable: true }
  const response = await fetcher(`https://api.figma.com/v1/files/${link.key}?depth=3&branch_data=true`, { headers: { 'X-Figma-Token': token }, redirect: 'error', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw Error('Figma refused this file or its access has expired')
  const text = await response.text()
  if (text.length > 8 * 1024 * 1024) throw Error('Figma metadata exceeded the discovery budget')
  const file = JSON.parse(text)
  if (typeof file.name !== 'string' || !file.document) throw Error('Figma file metadata is unavailable')
  const parent = `figma:${link.key}`
  const items = [{ id: parent, type: 'figma', title: file.name, detail: 'Latest design file', revision: file.version, url: link.url, updatedAt: file.lastModified, history: { kind: 'design', key: parent, status: 'file', updatedAt: date(file.lastModified) } }]
  for (const branch of (file.branches ?? []).slice(0, 100)) if (/^[a-zA-Z0-9]+$/.test(branch.key) && typeof branch.name === 'string') items.push({ id: `figma:${branch.key}`, type: 'figma', title: branch.name, detail: `Figma branch · ${file.name}`, url: `https://www.figma.com/design/${branch.key}`, updatedAt: branch.last_modified, history: { kind: 'design', key: `figma:${branch.key}`, parentKey: parent, status: 'design-branch', updatedAt: date(branch.last_modified) } })
  const visit = (node, page = '') => {
    if (node.type === 'CANVAS') page = node.name
    if (['FRAME', 'COMPONENT', 'COMPONENT_SET'].includes(node.type) && typeof node.id === 'string' && typeof node.name === 'string') items.push({ id: `figma:${link.key}:${node.id}`, type: 'figma', title: node.name, detail: `${page} · ${file.name}`, revision: file.version, url: `${link.url}?node-id=${encodeURIComponent(node.id)}`, updatedAt: file.lastModified, history: { kind: 'design', key: `figma:${link.key}:${node.id}`, parentKey: parent, status: 'frame', updatedAt: date(file.lastModified) } })
    for (const child of node.children ?? []) visit(child, page)
  }
  visit(file.document)
  return { items }
}
export async function discoverSourceVersions(projects, links, options = {}, { command = git, github = (repo, query) => run('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '100', ...(query ? ['--search', query] : []), '--json', 'number,title,headRefName,headRefOid,updatedAt,url,isDraft']), token = process.env.FIGMA_ACCESS_TOKEN, fetcher = fetch } = {}) {
  sourcePage([], options)
  const items = [], providers = [], repositories = new Map(), roots = new Set(), historyRoots = new Map(), connected = new Set(projects.map(project => project.root))
  for (const project of [...projects].sort((a, b) => Number(Boolean(a.manifest.design)) - Number(Boolean(b.manifest.design)))) {
    let root = project.root
    if (project.manifest.design) {
      let receipt = {}
      try { receipt = JSON.parse(await readFile(join(project.manifestRoot, 'receipt.json'), 'utf8')); root = receipt.source ?? root } catch {}
      items.push({ id: `design:${project.key}`, type: 'design', title: project.manifest.design.id, detail: 'Imported design snapshot', revision: receipt.sourceHead, connected: true, history: { kind: 'design', status: 'reference', capturedAt: date(receipt.capturedAt) } })
    }
    try {
      const common = await command(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
      if (roots.has(common)) continue
      roots.add(common)
      const result = await gitSources(root, project.manifest.sources[0], connected, command, options.query ?? '')
      for (const item of result.items) historyRoots.set(item.id, root)
      items.push(...result.items)
      providers.push({ name: 'Local Git', status: result.limited ? 'partial' : 'ready', message: result.limited ? 'Some statuses are not inspected yet. Search for a branch or folder to prioritize it.' : 'Local worktrees and unmerged branches' })
      const repository = githubRepository(await command(root, ['remote', 'get-url', 'origin']).catch(() => ''))
      if (repository) repositories.set(repository, root)
    } catch { providers.push({ name: 'Local Git', status: 'unavailable', message: 'Git source discovery is unavailable for one connected folder.' }) }
  }
  for (const repository of repositories.keys()) {
    try {
      const prs = JSON.parse(await github(repository, options.query?.trim() ?? ''))
      if (!Array.isArray(prs)) throw Error('Invalid GitHub response')
      for (const pr of prs) if (Number.isInteger(pr.number) && pr.number > 0 && typeof pr.title === 'string') items.push({ id: `pr:${repository}:${pr.number}`, type: 'pull-request', title: `#${pr.number} ${pr.title}`, detail: repository, branch: pr.headRefName, revision: pr.headRefOid, updatedAt: pr.updatedAt, url: `https://github.com/${repository}/pull/${pr.number}`, history: { kind: 'pull-request', status: pr.isDraft ? 'draft' : 'open', key: /^[a-f0-9]{40}$/i.test(pr.headRefOid ?? '') ? `git:${repository}:${pr.headRefOid}` : undefined, updatedAt: date(pr.updatedAt) } })
      providers.push({ name: 'GitHub', status: 'ready', message: `${repository} · ${prs.length}${prs.length === 100 ? '+' : ''} open PRs${options.query ? ' matching search' : ''}` })
    } catch { providers.push({ name: 'GitHub', status: 'unavailable', message: `${repository}: GitHub access unavailable. Sign in to gh on the CIVIC host and refresh.` }) }
  }
  if (!links.length) providers.push({ name: 'Figma', status: 'not-connected', message: 'Link a Figma file to discover its frames and branches.' })
  for (const link of links.slice(0, 10)) {
    try { const result = await figmaSources(figmaFile(link.url), token, fetcher); items.push(...result.items); providers.push({ name: 'Figma', status: result.unavailable ? 'not-connected' : 'ready', message: result.unavailable ? 'File linked. Set FIGMA_ACCESS_TOKEN on the CIVIC host to discover its frames and branches.' : 'Linked file, frames and available branches' }) }
    catch { providers.push({ name: 'Figma', status: 'unavailable', message: 'Figma file discovery failed. Check file access and refresh.' }) }
  }
  const page = sourcePage(items, options)
  // Traverse only the ten displayed sources, after pagination across all providers.
  await Promise.all(page.items.map(async item => { if (historyRoots.has(item.id)) item.history = { ...await gitHistory(historyRoots.get(item.id), item.revision, command), main: item.branch === 'main' } }))
  return { ...page, providers }
}
