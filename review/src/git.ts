import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'

/** What CIVIC needs to know about the checkout a command runs in. */
export interface Checkout {
  root: string
  /** The git directory shared by every worktree of the repository. */
  commonDir: string
  /** The working tree that owns `commonDir`. Every worktree keeps its records in this one's `.civic/` (decision 0020). */
  mainRoot: string
  /** A linked worktree has its own git directory inside the common one. */
  isWorktree: boolean
  /** Undefined on a detached HEAD. */
  branch: string | undefined
  defaultBranch: string
  head: string
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function tryGit(cwd: string, ...args: string[]): string | undefined {
  try {
    return git(cwd, ...args)
  } catch {
    return undefined
  }
}

export function readCheckout(cwd: string): Checkout {
  const root = git(cwd, 'rev-parse', '--show-toplevel')
  const commonDir = resolve(root, git(root, 'rev-parse', '--git-common-dir'))
  const gitDir = resolve(root, git(root, 'rev-parse', '--git-dir'))
  const branch = tryGit(root, 'symbolic-ref', '--quiet', '--short', 'HEAD')
  const head = git(root, 'rev-parse', 'HEAD')
  return { root, commonDir, mainRoot: mainRootOf(root, commonDir), isWorktree: gitDir !== commonDir, branch, defaultBranch: defaultBranch(root), head }
}

/** The first worktree git lists is the one that owns the repository; a bare repository lists itself. */
function mainRootOf(root: string, commonDir: string): string {
  const first = tryGit(root, 'worktree', 'list', '--porcelain')?.split('\n')[0]
  return first?.startsWith('worktree ') ? first.slice('worktree '.length) : dirname(commonDir)
}

function defaultBranch(root: string): string {
  const remote = tryGit(root, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD')
  if (remote) return remote.replace(/^origin\//, '')
  if (tryGit(root, 'rev-parse', '--verify', '--quiet', 'refs/heads/main')) return 'main'
  if (tryGit(root, 'rev-parse', '--verify', '--quiet', 'refs/heads/master')) return 'master'
  return 'main'
}

/** The worktree that has `branch` checked out, if any. Used to run acceptance checks on a fix's own line. */
export function worktreeFor(cwd: string, branch: string): string | undefined {
  const listing = tryGit(cwd, 'worktree', 'list', '--porcelain') ?? ''
  for (const block of listing.split('\n\n')) {
    const path = /^worktree (.+)$/m.exec(block)?.[1]
    const ref = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]
    if (path && ref === branch) return path
  }
  return undefined
}

/** The revision a branch points at, when it exists locally. */
export function revisionOf(cwd: string, ref: string): string | undefined {
  return tryGit(cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
}

/** Turns a branch name into the dot-separated path of a graph ID: `fix/intake-label` becomes `fix.intake-label`. */
export function idPath(name: string): string {
  return name
    .split(/[/.]+/)
    .map((segment) => segment.replace(/[^A-Za-z0-9_-]+/g, '-'))
    .filter((segment) => segment !== '' && segment !== '-')
    .join('.') || 'unnamed'
}
