import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { defaultViewportHeight, presetOf, validViewport, type PreviewViewport } from './viewport-presets'
import { supportsPreview } from './connection-readiness'

type Options = {
  getFrame: () => HTMLIFrameElement | null
  initial: PreviewViewport
  storageKey?: string
  fallbackStorageKey?: string
  liveOnly?: boolean
  onChange?: (viewport: PreviewViewport) => void
}
const normalize = (value: PreviewViewport): PreviewViewport => {
  const { preset: _preset, ...size } = value
  const preset = presetOf(size)
  return { ...size, ...(preset ? { preset: preset.id } : {}) }
}
const fromFrame = (frame: HTMLIFrameElement | null) => {
  const config = frame?.contentWindow?.reviewPreview?.config
  return config && normalize({ width: config.width, height: config.height ?? defaultViewportHeight, theme: config.theme, textScale: config.textScale })
}

export function usePreviewViewport(options: Options) {
  const [viewport, setViewport] = useState(() => {
    try {
      const saved = JSON.parse((options.storageKey && localStorage.getItem(options.storageKey)) || (options.fallbackStorageKey && localStorage.getItem(options.fallbackStorageKey)) || 'null')
      if (validViewport(saved)) return normalize(saved)
    } catch {}
    return normalize(options.initial)
  })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const current = useRef(viewport), pending = useRef(false), mounted = useRef(false), latest = useRef(options)
  useLayoutEffect(() => { latest.current = options })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const frame = options.getFrame()
    const sync = () => {
      const value = fromFrame(frame)
      if (pending.current || !value || !validViewport(value) || JSON.stringify(value) === JSON.stringify(current.current)) return
      current.current = value; setViewport(value)
    }
    const listen = () => { frame?.contentWindow?.addEventListener('rehearsal-state', sync); sync() }
    frame?.addEventListener('load', listen); listen()
    return () => { frame?.removeEventListener('load', listen); frame?.contentWindow?.removeEventListener('rehearsal-state', sync) }
  }, [options.getFrame])
  const change = async (patch: Partial<PreviewViewport>) => {
    if (pending.current) return
    const previous = current.current, next = normalize({ ...previous, ...patch })
    if (!validViewport(next)) { setError('Use a width of 200–1920 and a height of 200–1600 pixels.'); return }
    const { getFrame, storageKey, liveOnly } = latest.current
    const frame = getFrame()
    const preview = frame?.contentWindow?.reviewPreview
    if (liveOnly && !frame) { setError('Open a live preview first.'); return }
    if (frame && !supportsPreview(preview, 'resize')) { setError(preview?.readiness?.state === 'ready' ? preview.capabilities?.reason ?? 'This preview does not support resizing.' : 'Wait for the live preview to finish opening.'); return }
    const unchanged = () => frame === latest.current.getFrame() && preview === frame?.contentWindow?.reviewPreview && storageKey === latest.current.storageKey
    pending.current = true; setBusy(true); setError(''); setViewport(next)
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!mounted.current) return
      if (!unchanged()) throw Error('The preview changed while resizing. Try again on the current preview.')
      if (frame) await preview!.setViewport!(next)
      if (!mounted.current) return
      if (!unchanged()) throw Error('The preview changed while resizing. Try again on the current preview.')
      current.current = next; setViewport(next)
      if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      latest.current.onChange?.(next)
    } catch (caught) {
      if (mounted.current) {
        const replacement = latest.current.getFrame()
        const value = !unchanged() ? fromFrame(replacement) ?? previous : previous
        current.current = value; setViewport(value); setError((caught as Error).message)
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  return { viewport, busy, error, change }
}
export type ViewportController = ReturnType<typeof usePreviewViewport>
