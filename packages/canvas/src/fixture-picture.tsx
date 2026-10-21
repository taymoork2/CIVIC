import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ImageOff } from '@civic/shell/icons'
import { Skeleton } from '@civic/shell/ui/skeleton'
import { projectFetch } from './project-request'

export function fixtureURL(screen: string, source: string, viewport?: { width: number; height: number }, pixelRatio = 1) {
  return `/api/review/fixture.png?${new URLSearchParams({ screen, source, ...(viewport ? { width: String(viewport.width), height: String(viewport.height) } : {}), ...(pixelRatio === 2 ? { pixelRatio: '2' } : {}) })}`
}

function afterNavigation(element: HTMLElement, signal: AbortSignal, action: () => void) {
  if (signal.aborted) return
  const stage = element.closest('.rh-canvas')
  const settle = () => { cleanup(); if (!signal.aborted) action() }
  const cleanup = () => { stage?.removeEventListener('civic-camera-settled', settle); signal.removeEventListener('abort', cleanup) }
  if (!stage?.classList.contains('is-navigating')) { action(); return }
  stage.addEventListener('civic-camera-settled', settle, { once: true }); signal.addEventListener('abort', cleanup, { once: true })
}

/** Observe the transformed canvas, rather than relying on browser lazy-loading distance. */
export function FixturePicture({ src, alt, active = true, viewport }: { src: string; alt: string; active?: boolean; viewport?: { width: number; height: number } }) {
  const target = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [picture, setPicture] = useState<{ source: string; url: string } | null>(null)
  useEffect(() => {
    setVisible(false); setFailed(false)
    if (!active) return
    const element = target.current!
    const controller = new AbortController()
    const observer = new IntersectionObserver(([entry]) => {
      afterNavigation(element, controller.signal, () => setVisible(!!entry?.isIntersecting))
    }, { root: element.closest('.rh-canvas'), rootMargin: '80px' })
    observer.observe(element)
    return () => { controller.abort(); observer.disconnect() }
  }, [active])
  useEffect(() => { setAttempt(0); setFailed(false) }, [src])
  useEffect(() => {
    if (!active || !visible || picture?.source === src) return
    const controller = new AbortController()
    let retry: ReturnType<typeof setTimeout>
    if (!picture && src.startsWith('/api/review/fixture.png?')) {
      void projectFetch(src + '&cached=1', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) return
        const cached = new URL(src, location.origin); cached.searchParams.set('source', response.headers.get('x-review-source') ?? '')
        const blob = await response.blob()
        afterNavigation(target.current!, controller.signal, () => setPicture((prior) => prior ?? { source: cached.pathname + cached.search, url: URL.createObjectURL(blob) }))
      }).catch(() => {})
    }
    setFailed(false)
    // Keep background images from occupying every connection needed by Play and reviews.
    void navigator.locks.request('rehearsal-snapshot', { signal: controller.signal }, async () => {
      const response = await projectFetch(src, { signal: controller.signal })
      if (!response.ok) throw Error('Snapshot unavailable')
      return response.blob()
    }).then((blob) => {
      afterNavigation(target.current!, controller.signal, () => setPicture({ source: src, url: URL.createObjectURL(blob) }))
    }).catch(() => { if (!controller.signal.aborted) { setFailed(true); retry = setTimeout(() => setAttempt((value) => value + 1), Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))) } })
    return () => { controller.abort(); clearTimeout(retry) }
  }, [src, active, visible, picture?.source, attempt])
  useEffect(() => () => { if (picture) URL.revokeObjectURL(picture.url) }, [picture])
  return <span ref={target} className="rh-fixture-picture" style={viewport ? { '--fixture-aspect': viewport.width / viewport.height } as CSSProperties : undefined} data-snapshot-stale={picture && picture.source !== src ? 'true' : undefined}>
    {picture ? <><img src={picture.url} alt={alt} decoding="async" onError={() => setPicture(null)} />{picture.source !== src && <span className="rh-snapshot-state">{failed ? 'Retrying update…' : 'Updating…'}</span>}</> : <span className="civic-snapshot-placeholder" role="status">{failed ? <><ImageOff aria-hidden="true" /><strong>Snapshot unavailable</strong><small>Retrying automatically. Select this screen and press Play to open it.</small></> : <><Skeleton className="cv:h-16 cv:w-3/4" /><span>Preparing snapshot…</span></>}</span>}
  </span>
}
