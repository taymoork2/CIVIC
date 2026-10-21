import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { defaultViewportHeight, presetOf, validViewport, type PreviewViewport } from './viewport-presets'
import { supportsPreview } from './connection-readiness'
import { useShellTheme } from '@civic/shell/theme'

type Options = {
  getFrame: () => HTMLIFrameElement | null
  initial: PreviewViewport
  storageKey?: string
  fallbackStorageKey?: string
  liveOnly?: boolean
  onChange?: (viewport: PreviewViewport) => void
  appThemes?: readonly string[]
}
const normalize = (value: PreviewViewport): PreviewViewport => {
  const { preset: _preset, ...size } = value
  const preset = presetOf(value)
  return { ...size, ...(preset ? { preset: preset.id } : {}) }
}
const fromFrame = (frame: HTMLIFrameElement | null) => {
  const config = frame?.contentWindow?.reviewPreview?.config
  // Recorded evidence replays its resolved scheme even when this machine's system preference differs.
  const appearance = frame && new URL(frame.src, location.href).searchParams.has('recording') ? config?.theme : config?.appearance
  return config && normalize({ width: config.width, height: config.height ?? defaultViewportHeight, theme: config.theme, textScale: config.textScale, preset: config.preset, ...(appearance ? { appearance } : {}), ...(config.appTheme ? { appTheme: config.appTheme } : {}) })
}

export function usePreviewViewport(options: Options) {
  const systemTheme = useShellTheme().system ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const [viewport, setViewport] = useState(() => {
    try {
      const saved = JSON.parse((options.storageKey && localStorage.getItem(options.storageKey)) || (options.fallbackStorageKey && localStorage.getItem(options.fallbackStorageKey)) || 'null')
      if (validViewport(saved)) {
        if (saved.appearance === 'system') saved.theme = systemTheme
        if (saved.appTheme && !options.appThemes?.includes(saved.appTheme)) {
          if (options.initial.appTheme) saved.appTheme = options.initial.appTheme
          else delete saved.appTheme
        }
        if (!saved.appTheme && options.initial.appTheme) saved.appTheme = options.initial.appTheme
        return normalize(saved)
      }
    } catch {}
    return normalize({ ...options.initial, ...(options.initial.appearance === 'system' ? { theme: systemTheme } : {}) })
  })
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ready, setReady] = useState(false)
  const current = useRef(viewport), pending = useRef(false), mounted = useRef(false), latest = useRef(options)
  useLayoutEffect(() => { latest.current = options })
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const frame = options.getFrame()
    const sync = () => {
      setReady(supportsPreview(frame?.contentWindow?.reviewPreview, 'resize'))
      const value = fromFrame(frame)
      if (pending.current || !value || !validViewport(value) || JSON.stringify(value) === JSON.stringify(current.current)) return
      current.current = value; setViewport(value)
    }
    const listen = () => { frame?.contentWindow?.addEventListener('rehearsal-state', sync); frame?.contentWindow?.addEventListener('civic-preview-status', sync); sync() }
    frame?.addEventListener('load', listen); listen()
    return () => { frame?.removeEventListener('load', listen); frame?.contentWindow?.removeEventListener('rehearsal-state', sync); frame?.contentWindow?.removeEventListener('civic-preview-status', sync) }
  }, [options.getFrame])
  const change = async (patch: Partial<PreviewViewport>) => {
    if (pending.current) return
    const previous = current.current, next = normalize({ ...previous, ...patch, ...(patch.theme && !patch.appearance ? { appearance: patch.theme } : {}) })
    if (next.appearance === 'system') next.theme = systemTheme
    else if (next.appearance) next.theme = next.appearance
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
  useEffect(() => {
    const replaying = latest.current.getFrame()?.contentDocument?.getElementById('review-root')?.dataset.rehearsalReplaying === 'true'
    if (viewport.appearance === 'system' && !pending.current && !replaying && current.current.theme !== systemTheme) void change({ appearance: 'system' })
  }, [viewport.appearance, busy, systemTheme])
  return { viewport, busy, error, ready, change }
}
export type ViewportController = ReturnType<typeof usePreviewViewport>
