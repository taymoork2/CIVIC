import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import project from 'virtual:civic-project'
import { reviewApi } from './review-api'
import type { AppVersion, DraftScreen } from './project-choice'
import type { VersionChoice } from '@civic/shell/version-choices'
import type { VersionHistory } from './version-history'
import type { VersionChange } from './version-changes'
import type { ConnectionReadiness, PreviewCapabilities } from './connection-readiness'

type App = { id: string; name: string }
type Connection = { key: string; name: string; sourceName?: string; refreshRequired?: boolean; root: string; manifest: string; app: App; kind: string; design?: { id: string }; version?: { id?: string; name?: string; history?: VersionHistory }; workspace?: string; workspaceName?: string; preview?: boolean; available: boolean; error?: string; readiness?: ConnectionReadiness; capabilities?: PreviewCapabilities }
export type Connections = { active: string; projects: Connection[]; apps: (App & { connections: Connection[]; versions: AppVersion<Connection>[] })[]; workspaceErrors: string[]; canOpenWindow?: boolean }
type VersionPage = { items: (VersionChoice<Connection> & { previewCount: number })[]; total: number; offset: number; limit: number; hasMore: boolean; errors: string[] }

export async function requestProjects<T>(input?: unknown, signal?: AbortSignal): Promise<T> {
  return reviewApi<T>('projects', input, { signal, fallback: 'Project request failed' })
}

export function useProjectVersions({ open, mode, browseAppId, target, versionQuery, expandedVersion, offset, refresh, setError }: {
  open: boolean; mode: string; browseAppId: string; target?: DraftScreen; versionQuery: string; expandedVersion: string; offset: number; refresh: string; setError: Dispatch<SetStateAction<string>>
}) {
  const [connections, setConnections] = useState<Connections | null>(null)
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [page, setPage] = useState<(VersionPage & { scope: string }) | null>(null)
  const [details, setDetails] = useState<Record<string, VersionPage['items'][number]>>({})
  const [pageError, setPageError] = useState(''), [detailError, setDetailError] = useState('')
  const [loadingScreens, setLoadingScreens] = useState(false)
  const [changes, setChanges] = useState<Record<string, VersionChange>>({})
  const [changeError, setChangeError] = useState('')
  const selectedIdentity = target && { id: target.id, label: target.label, targetId: target.targetId, componentId: target.componentId, route: target.route, component: target.component, componentExport: target.componentExport, state: target.state ?? (target.fixture && typeof target.fixture === 'object' && 'state' in target.fixture && typeof target.fixture.state === 'string' ? target.fixture.state : undefined) }
  const pageRequest = JSON.stringify({ app: browseAppId, selected: selectedIdentity, query: versionQuery, offset, refresh })
  const versions = page?.scope === pageRequest ? page.items.map(item => details[item.id] ?? item) : []

  const visibleVersions = versions
  const previewCount = page?.scope === pageRequest ? page.total : 0
  const currentVersion = connections?.projects.find(row => !row.workspace && row.key === project.key)?.version
  const comparisonPreviews = visibleVersions.filter(item => !item.current || item.preview.row.refreshRequired).map(item => item.preview).filter(item => item.screen)
  const comparisonRequest = JSON.stringify({ scenario: target?.id, baseVersion: currentVersion?.id, candidates: comparisonPreviews.map(item => ({ id: item.id, key: item.row.key, workspace: item.row.workspace, scenario: item.screen!.id, version: item.row.version?.id })) })

  const hasConnections = connections !== null
  useEffect(() => {
    if (!open && hasConnections) return
    const controller = new AbortController()
    setLoadingConnections(true); setError('')
    void requestProjects<Connections>({ action: 'catalog' }, controller.signal).then(result => { if (!controller.signal.aborted) setConnections(result) }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setLoadingConnections(false) })
    return () => controller.abort()
  }, [open, hasConnections])
  useEffect(() => {
    if (!open || mode !== 'work' || !hasConnections) return
    const controller = new AbortController()
    setLoadingScreens(true); setPageError(''); setDetails({}); setDetailError('')
    const pending = setTimeout(() => { void requestProjects<VersionPage>({ ...JSON.parse(pageRequest), action: 'version-page' }, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setPage({ ...result, scope: pageRequest })
      setConnections(current => current && { ...current, projects: [...new Map([...current.projects, ...result.items.flatMap(item => item.connections)].map(row => [`${row.workspace ?? ''}:${row.key}`, row])).values()] })
    }).catch(error => { if (!controller.signal.aborted) { setPage(null); setPageError(error.message) } }).finally(() => { if (!controller.signal.aborted) setLoadingScreens(false) }) }, 150)
    return () => { clearTimeout(pending); controller.abort() }
  }, [open, mode, hasConnections, pageRequest, refresh])
  useEffect(() => {
    if (!open || mode !== 'work' || !expandedVersion || loadingScreens) return
    const controller = new AbortController()
    setDetailError('')
    void requestProjects<VersionPage>({ ...JSON.parse(pageRequest), action: 'version-page', version: expandedVersion, offset: 0, limit: 1 }, controller.signal).then(result => {
      if (!controller.signal.aborted && result.items[0]) setDetails(current => ({ ...current, [expandedVersion]: result.items[0]! }))
    }).catch(error => { if (!controller.signal.aborted) setDetailError(error.message) })
    return () => controller.abort()
  }, [open, mode, expandedVersion, loadingScreens, pageRequest])
  useEffect(() => {
    if (!open || mode !== 'work' || loadingScreens) return
    const input = JSON.parse(comparisonRequest)
    if (!input.scenario || !input.candidates.length) return
    let cancelled = false
    const controller = new AbortController()
    setChanges({}); setChangeError('')
    const pending = setTimeout(() => { void requestProjects<{ comparisons: VersionChange[] }>({ ...input, action: 'changes' }, controller.signal).then(result => {
      if (!cancelled) setChanges(Object.fromEntries(result.comparisons.map(item => [item.id, item])))
    }).catch(() => { if (!cancelled) setChangeError('Changes could not be loaded. Reopen the picker to retry.') }) }, 150)
    return () => { cancelled = true; clearTimeout(pending); controller.abort() }
  }, [open, mode, loadingScreens, comparisonRequest])

  const clearChanges = () => { setChanges({}); setChangeError('') }
  const reset = () => { setPage(null); setDetails({}); clearChanges(); setLoadingScreens(false) }
  const reloadConnections = async () => setConnections(await requestProjects<Connections>({ action: 'catalog' }))
  return { connections, loadingConnections, loadingScreens, page, details, pageError, detailError, changes, changeError, pageRequest, versions, previewCount, reset, clearChanges, reloadConnections }
}
