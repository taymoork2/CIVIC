import type { VersionHistory } from './version-history'
export { matchingDraftScreens, preferredConnection, versionChoices } from '@civic/shell/version-choices'
export type { DraftScreen, AppVersion } from '@civic/shell/version-choices'
export function projectWindowHref(key: string, workspace?: string) {
  const params = new URLSearchParams({ openProject: key })
  if (workspace) params.set('workspace', workspace)
  return `/review?${params}`
}

export function projectWindowDestination(value: string, desktop?: string | null) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/review' || url.search || url.hash) throw Error('The project window did not return a local CIVIC address')
  if (desktop) url.searchParams.set('desktop', desktop)
  return url.href
}
export function projectShortcut(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented: boolean; repeat: boolean; isComposing: boolean }, key = 'k') {
  return event.key.toLowerCase() === key && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && !event.defaultPrevented && !event.repeat && !event.isComposing
}

export function versionCaption(value: string) {
  const revision = value.match(/ · ([a-f0-9]{7,40})$/i)
  return { name: revision ? value.slice(0, -revision[0].length) : value, revision: revision?.[1] }
}

export function versionDetails(value: string) {
  const caption = versionCaption(value)
  const name = caption.name.replace(/ · edited$/, '')
  return { ...caption, name, edited: name !== caption.name }
}

export function checkoutGroup(version: { kind: string; name: string; history?: VersionHistory; connections: { kind: string; sourceName?: string; name?: string }[] }) {
  const branches = [...new Set(version.connections.filter(row => !['live', 'isolated', 'design'].includes(row.kind)).map(row => versionDetails(row.sourceName ?? row.name ?? '').name).filter(Boolean))]
  const revision = version.history?.revision
  const shared = version.kind === 'implementation' && branches.length > 1 && Boolean(revision)
  return { branches, shared, label: shared ? `Commit ${revision!.slice(0, 8)}` : version.name }
}
