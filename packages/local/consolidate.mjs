import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, readlink, realpath, rename, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { repo } from './onboard.mjs'

const json = async path => JSON.parse(await readFile(path, 'utf8'))
const inside = (root, path) => path.startsWith(root + '/')
const encode = value => JSON.stringify(value, null, 2) + '\n'
async function files(root, { dependencies = false } = {}) {
  const result = []
  const walk = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === '.git' || !dependencies && entry.name === 'node_modules') continue
      const file = join(path, entry.name)
      if (entry.isDirectory()) await walk(file)
      else result.push({ file, link: entry.isSymbolicLink() })
      if (result.length > 250_000) throw Error('Source inventory exceeds the migration limit')
    }
  }
  await walk(root)
  return result.sort((a, b) => a.file.localeCompare(b.file))
}
export async function fingerprint(root, excluded = []) {
  const hash = createHash('sha256'); let count = 0
  for (const row of await files(root)) {
    const path = relative(root, row.file)
    if (excluded.includes(path)) continue
    hash.update(encode([path, row.link])); hash.update(row.link ? await readlink(row.file) : await readFile(row.file)); count++
  }
  return { files: count, sha256: hash.digest('hex') }
}

/** Relocates only the two configured, CIVIC-owned clones. Evidence bytes and connection keys stay put. */
export async function consolidate({ isolatedStore, sourceRoot = join(homedir(), 'Projects/civic-instances'), apply = false }) {
  const main = join(repo, '.civic-canvas'), isolated = await realpath(isolatedStore)
  if (!inside(join(main, 'dogfood'), isolated)) throw Error('Choose an existing CIVIC dogfood store')
  const configs = await Promise.all([main, isolated].map(store => json(join(store, 'local-config.json'))))
  const targetRoot = resolve(sourceRoot)
  if (!isAbsolute(sourceRoot) || targetRoot === homedir() || targetRoot === '/' || targetRoot === repo || inside(repo, targetRoot)) throw Error('Source storage must be outside CIVIC')
  const moves = [
    { from: await realpath(configs[0].laundry), to: join(targetRoot, 'laundry') },
    { from: await realpath(configs[1].laundry), to: join(targetRoot, `${isolated.split('/').at(-1)}-laundry`) },
  ]
  if (!inside(join(main, 'inputs'), moves[0].from) || !inside(isolated, moves[1].from)) throw Error('Only CIVIC-owned input clones may be moved')
  for (const move of moves) {
    if (!(await stat(join(move.from, '.git'))).isDirectory()) throw Error('Linked Git worktrees require their owner to move them')
    const top = execFileSync('git', ['-C', move.from, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    if (top !== move.from) throw Error('Source ownership changed')
    if (await stat(move.to).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })) throw Error(`Destination already exists: ${move.to}`)
  }
  const remap = path => {
    const move = moves.find(move => path === move.from || inside(move.from, path))
    return move ? move.to + path.slice(move.from.length) : path
  }
  const stores = [main, isolated], snapshots = {}, before = [], links = []
  for (const store of stores) {
    for (const name of ['local-config.json', '.review-data/project-picker.json', '.review-data/application.json']) {
      const path = join(store, name); snapshots[path] = await readFile(path, 'utf8')
    }
    for (const row of JSON.parse(snapshots[join(store, '.review-data/project-picker.json')])) {
      const manifest = await json(row.manifest)
      if (!['orca-design-study', 'orca-live', 'orca-isolated', 'laundry-app'].includes(manifest.id)) throw Error('An unrecognized connection needs an explicit app assignment before this migration')
    }
    before.push({ store, evidence: await fingerprint(join(store, '.review-data/projects')) })
  }
  const excluded = ['apps/web/package.json', 'pnpm-lock.yaml']
  for (const move of moves) {
    move.source = await fingerprint(move.from, excluded)
    for (const path of excluded) snapshots[join(move.from, path)] = await readFile(join(move.from, path), 'utf8')
    for (const row of await files(move.from, { dependencies: true })) {
      if (!row.link) continue
      const target = await readlink(row.file), next = remap(row.file), destination = remap(resolve(dirname(row.file), target))
      if (resolve(dirname(next), target) !== destination) links.push({ file: next, before: target, after: isAbsolute(target) ? destination : relative(dirname(next), destination) })
    }
  }
  const processes = await Promise.all(stores.map(async (store, index) => {
    const runtime = await json(join(store, 'runtime.json'))
    const command = execFileSync('ps', ['-p', String(runtime.pid), '-o', 'command='], { encoding: 'utf8' }).trim()
    if (runtime.port !== 3012 + index || !command.endsWith(`${join(repo, 'packages/local/start.mjs')} --serve`)) throw Error('CIVIC listener ownership changed')
    return runtime
  }))
  const plan = { moves, before, links, processes, snapshots }
  if (!apply) return { ...plan, snapshots: Object.keys(snapshots), links: links.length, apply: false }
  const backup = join(main, 'migrations', `consolidate-${randomUUID()}`)
  await mkdir(backup, { recursive: true, mode: 0o700 })
  await writeFile(join(backup, 'before.json'), encode(plan), { mode: 0o600, flag: 'wx' })
  for (const runtime of processes) process.kill(runtime.pid, 'SIGTERM')
  for (let attempt = 0; attempt < 100; attempt++) {
    if (processes.every(runtime => { try { process.kill(runtime.pid, 0); return false } catch (error) { if (error.code === 'ESRCH') return true; throw error } })) break
    if (attempt === 99) throw Error(`CIVIC has not stopped. Backup: ${backup}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  await mkdir(targetRoot, { recursive: true, mode: 0o700 })
  for (const move of moves) await rename(move.from, move.to)
  for (const link of links) { await unlink(link.file); await symlink(link.after, link.file) }
  for (const move of moves) {
    if (JSON.stringify(await fingerprint(move.to, excluded)) !== JSON.stringify(move.source)) throw Error(`Source preservation failed; inspect ${backup}`)
    for (const file of excluded) {
      const text = snapshots[join(move.from, file)].replaceAll('link:../../../../../packages/', `link:${join(repo, 'packages')}/`)
      await writeFile(join(move.to, file), text)
    }
  }
  for (const [index, store] of stores.entries()) {
    const config = JSON.parse(snapshots[join(store, 'local-config.json')])
    config.laundry = remap(config.laundry)
    config.workspaces = [{ store: stores[1 - index], origin: `http://127.0.0.1:${3013 - index}`, name: index ? 'Main CIVIC' : 'Isolated CIVIC' }]
    const registry = JSON.parse(snapshots[join(store, '.review-data/project-picker.json')])
    for (const row of registry) {
      row.root = remap(row.root); row.manifest = remap(row.manifest)
      const manifest = await json(row.manifest)
      row.app = manifest.id.startsWith('orca-') ? { id: 'orca', name: 'Orca' } : { id: 'laundry', name: 'Laundry App' }
      row.kind = manifest.adapter.mode === 'live-read-only' ? 'live' : manifest.adapter.runtime ? 'isolated' : manifest.design ? 'design' : 'implementation'
    }
    const selected = JSON.parse(snapshots[join(store, '.review-data/application.json')])
    selected.project = remap(selected.project); selected.root = remap(selected.root)
    for (const [file, value] of Object.entries({ 'local-config.json': config, '.review-data/project-picker.json': registry, '.review-data/application.json': selected })) {
      const path = join(store, file), temporary = path + '.consolidating'
      await writeFile(temporary, encode(value), { mode: 0o600, flag: 'wx' }); await rename(temporary, path)
    }
  }
  const after = await Promise.all(stores.map(async store => ({ store, evidence: await fingerprint(join(store, '.review-data/projects')) })))
  if (JSON.stringify(after) !== JSON.stringify(before)) throw Error(`Evidence preservation failed; inspect ${backup}`)
  const result = { backup, moves, evidence: after, repairedLinks: links.length, preservedConnectionKeys: true }
  await writeFile(join(backup, 'result.json'), encode(result), { mode: 0o600 })
  return result
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { 'isolated-store': { type: 'string' }, 'source-root': { type: 'string' }, apply: { type: 'boolean', default: false } } })
  if (!values['isolated-store']) throw Error('Supply --isolated-store; inspect the dry run before --apply')
  console.log(encode(await consolidate({ isolatedStore: values['isolated-store'], sourceRoot: values['source-root'], apply: values.apply })))
}
