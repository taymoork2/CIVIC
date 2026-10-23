import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Checkout } from './git.ts'
import { Store } from './store.ts'

export interface MoveResult {
  from: string
  to: string
  /** Files copied into the new store. */
  moved: string[]
  /** Folders of the old store that could not be removed because something else is in them. */
  left: string[]
}

/**
 * Moves the records an earlier CIVIC kept in the git common directory (`<git dir>/civic`, decision 0007)
 * into the main working tree's `.civic/` (decision 0020). It is safe to run again: files already in
 * place are skipped, and a second run finds nothing. It refuses, changing nothing, if both folders
 * hold a file of the same name with different bytes, if a civic command is running (its lock exists),
 * or if the old folder holds anything but plain files. It deletes only the old store's own files, one by
 * one, after their copies are checked, and then its empty folders.
 */
export function moveStore(checkout: Checkout): MoveResult {
  const from = join(checkout.commonDir, 'civic')
  const store = Store.forCheckout(checkout)
  const result: MoveResult = { from, to: store.dir, moved: [], left: [] }
  if (!existsSync(from)) return result
  if (existsSync(join(from, 'lock'))) throw new Error(`A civic command is running on ${from} (it holds ${join(from, 'lock')}). Let it finish, then move the store.`)
  const files = filesIn(from)
  const same = (file: string) => readFileSync(join(store.dir, file)).equals(readFileSync(join(from, file)))
  for (const file of files) {
    if (existsSync(join(store.dir, file)) && !same(file)) throw new Error(`Both ${from} and ${store.dir} hold ${file}, with different contents. Nothing was moved; keep one of them first.`)
  }
  store.ensure()
  for (const file of files) {
    const target = join(store.dir, file)
    if (!existsSync(target)) {
      mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 })
      copyFileSync(join(from, file), target)
      result.moved.push(file)
    }
    if (!same(file)) throw new Error(`The copy of ${file} doesn't match; the old store was left as it was.`)
  }
  for (const file of files) unlinkSync(join(from, file))
  for (const dir of foldersIn(from).reverse()) {
    try { rmdirSync(dir) } catch { result.left.push(dir) }
  }
  return result
}

/** Regular files under `dir`, as relative paths. A link or anything else is not CIVIC's and stops the move. */
function filesIn(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = join(prefix, entry.name)
    const kind = lstatSync(join(dir, path))
    if (kind.isDirectory()) return filesIn(dir, path)
    if (!kind.isFile()) throw new Error(`${join(dir, path)} is not a file CIVIC wrote, so the store was not moved.`)
    return [path]
  })
}

/** `dir` and the folders under it, each before its own folders. */
function foldersIn(dir: string, prefix = ''): string[] {
  const here = join(dir, prefix)
  return [here, ...readdirSync(here, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => foldersIn(dir, join(prefix, entry.name)))]
}
