import { gitSources } from '../vite-connector/src/review-source-versions.mjs'

/** Read-only discovery shared by app-specific isolated preview connectors. */
export function worktreeConnections(source, connect, { includeSource = false, paths } = {}) {
  let pending, checked = 0, result = { connections: [], errors: [] }
  return async () => {
    if (pending) return pending
    if (Date.now() - checked < 10000) return result
    pending = (async () => {
      const discovered = await gitSources(source, 'apps/web/src', new Set([source]), undefined, '', { paths })
      const next = { connections: [], errors: [] }
      if (discovered.limited) next.errors.push('Some worktree statuses are unavailable. Those checkouts have not been connected automatically.')
      for (const tree of discovered.items.filter(row => row.type === 'worktree' && row.active && (includeSource || row.path !== source) && row.detail !== 'Status unavailable')) {
        try { next.connections.push(await connect(tree)) }
        catch (error) { next.errors.push(`${tree.title}: preview unavailable. ${error.message}`) }
      }
      next.errors = [...new Set(next.errors)]
      checked = Date.now(); result = next; return next
    })().finally(() => { pending = null })
    return pending
  }
}
