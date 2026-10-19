import { useEffect, useState } from 'react'

export type ConnectionReadiness = { state: 'unchecked' | 'checking' | 'ready' | 'stale' | 'failed' | 'unsupported'; source?: string; reason?: string }
export type PreviewCapabilities = { resize?: boolean; record?: boolean; replay?: boolean; reason?: string }
type Preview = { mode?: string; readiness?: ConnectionReadiness; capabilities?: PreviewCapabilities; setViewport?: unknown; recording?: unknown; replay?: unknown }

export function readinessFor(value?: ConnectionReadiness, source?: string): ConnectionReadiness {
  if (!value) return { state: 'unchecked', reason: 'Preview not tested.' }
  if (value.state === 'ready' && !value.source) return { state: 'unchecked', reason: 'Preview has no source fingerprint.' }
  return value.state === 'ready' && source && value.source !== source ? { ...value, state: 'stale', reason: 'This preview uses an earlier source revision.' } : value
}

export function supportsPreview(preview: Preview | undefined, capability: 'resize' | 'record' | 'replay') {
  const method = { resize: 'setViewport', record: 'recording', replay: 'replay' } as const
  return preview?.readiness?.state === 'ready' && Boolean(preview.readiness.source) && preview.capabilities?.[capability] === true
    && typeof preview[method[capability]] === 'function' && !(capability === 'replay' && preview.mode === 'live-read-only')
}

/** Observe only the current iframe document; a late event from its replaced document proves nothing. */
export function useFrameReadiness(getFrame: () => HTMLIFrameElement | null, project: string, source: string) {
  const [observed, setObserved] = useState<ConnectionReadiness>()
  useEffect(() => {
    const frame = getFrame()
    let win: Window | null = null, doc: Document | null = null
    const leaving = () => { if (frame === getFrame() && doc === frame?.contentDocument) setObserved({ state: 'checking', reason: 'Opening preview…' }) }
    const update = () => {
      if (frame !== getFrame() || doc !== frame?.contentDocument) return
      const root = doc?.getElementById('review-root')
      if (root?.dataset.civicProject !== project) { setObserved(previous => previous?.state === 'checking' ? previous : { state: 'checking', reason: 'Opening preview…' }); return }
      const preview = win?.reviewPreview
      const readiness = preview?.readiness
      const value: ConnectionReadiness = readiness && readiness.source === root.dataset.civicSource ? readiness : {
        state: root.dataset.civicPreview === 'failed' ? 'failed' : 'checking', source: root.dataset.civicSource,
        reason: root.querySelector('[role="alert"]')?.textContent ?? 'Opening preview…',
      }
      setObserved(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value)
    }
    const attach = () => {
      win?.removeEventListener('civic-preview-status', update)
      win?.removeEventListener('pagehide', leaving)
      win = frame?.contentWindow ?? null; doc = frame?.contentDocument ?? null
      win?.addEventListener('civic-preview-status', update)
      win?.addEventListener('pagehide', leaving)
      update()
    }
    if (!frame) setObserved(previous => previous === undefined ? previous : undefined)
    frame?.addEventListener('load', attach); attach()
    return () => { frame?.removeEventListener('load', attach); win?.removeEventListener('civic-preview-status', update); win?.removeEventListener('pagehide', leaving) }
  }, [getFrame, project])
  return readinessFor(observed, source)
}
