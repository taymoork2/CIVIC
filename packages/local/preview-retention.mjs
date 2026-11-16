import { lstatSync, realpathSync, opendirSync, readFileSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep, parse } from 'node:path'

const BUILD = /^builds\/[a-f0-9]{16}-[a-f0-9]{8}$/

function inside(base, path) {
  const rel = relative(base, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

// Callers serialize retention with publication and preview lease changes.
export function retainPreviewBuilds(store, { live, inUse, limit = 500_000 }) {
  if (typeof store !== 'string' || !store.trim() || resolve(store) === parse(resolve(store)).root) throw Error('Invalid preview store')
  const removed = [], refused = []
  let remaining = limit
  function inspect(path) {
    if (--remaining < 0) throw Error('Preview retention scan limit')
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw Error(`Symlink refused: ${path}`)
    return stat
  }
  function directory(path) {
    if (!inspect(path).isDirectory() || realpathSync(path) !== path) throw Error(`Unsafe directory: ${path}`)
  }
  function entries(path) {
    const dir = opendirSync(path), names = []
    try {
      for (let entry; (entry = dir.readSync());) {
        if (--remaining < 0) throw Error('Preview retention scan limit')
        names.push(entry.name)
      }
    } finally { dir.closeSync() }
    return names
  }
  // Links inside a candidate are counted and removed as links; rmSync never follows them.
  function size(path) {
    if (--remaining < 0) throw Error('Preview retention scan limit')
    const stat = lstatSync(path)
    if (!stat.isDirectory()) return stat.isFile() ? stat.size : 0
    return entries(path).reduce((bytes, name) => bytes + size(join(path, name)), 0)
  }
  const base = resolve(store)
  // Reject links in every ancestor, including a linked store or projects directory.
  for (let path = base; path !== parse(path).root; path = resolve(path, '..')) directory(path)
  const projects = join(base, 'projects')
  try { directory(projects) } catch (error) { if (error.code === 'ENOENT') return { removed, refused, bytes: 0 }; throw error }
  function rootPath(path) {
    if (!isAbsolute(path)) throw Error('Worktree roots must be absolute')
    try { return realpathSync(path) } catch (error) { if (error.code !== 'ENOENT') throw error; return resolve(path) }
  }
  const liveRoots = new Set([...live].map(rootPath))
  const used = [...inUse].map(path => {
    if (!isAbsolute(path) || !inside(projects, resolve(path))) throw Error('In-use build outside projects')
    if (!/^[^/]+\/builds\/[a-f0-9]{16}-[a-f0-9]{8}$/.test(relative(projects, resolve(path)))) throw Error('Invalid in-use build')
    directory(resolve(path))
    return realpathSync(path)
  })
  for (const name of entries(projects)) {
    if (remaining <= 0) break
    const project = join(projects, name)
    try {
      directory(project)
      const receiptPath = join(project, 'receipt.json')
      const info = inspect(receiptPath)
      if (!info.isFile() || info.size > 65536) throw Error('Invalid preview receipt')
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
      if (typeof receipt.root !== 'string' || !isAbsolute(receipt.root) || typeof receipt.worktreeHash !== 'string' || !receipt.worktreeHash || !BUILD.test(receipt.worktreeBuild)) throw Error('Invalid preview receipt')
      const active = used.filter(path => inside(project, path))
      const targets = []
      if (!liveRoots.has(rootPath(receipt.root))) {
        if (!active.length) targets.push(project)
      } else {
        const builds = join(project, 'builds')
        directory(builds)
        directory(join(project, receipt.worktreeBuild))
        for (const build of entries(builds)) {
          const path = join(builds, build)
          if (`builds/${build}` !== receipt.worktreeBuild && !active.some(used => used === path || inside(path, used))) targets.push(path)
        }
      }
      // Size every candidate before deleting any, so a scan limit deletes nothing.
      const candidates = targets.map(path => {
        if (!inside(projects, path)) throw Error('Deletion outside projects')
        directory(path)
        return { path, bytes: size(path) }
      })
      for (const candidate of candidates) {
        rmSync(candidate.path, { recursive: true })
        removed.push(candidate)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') refused.push({ path: project, reason: error.message })
    }
  }
  return { removed, refused, bytes: removed.reduce((sum, item) => sum + item.bytes, 0) }
}
