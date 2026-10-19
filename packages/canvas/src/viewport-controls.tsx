import { Button } from '@civic/shell/ui/button'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { useEffect, useState } from 'react'
import { defaultViewportHeight, presetOf, viewportPresets, type PreviewViewport } from './viewport-presets'

/** Changes a live preview's viewport, appearance and text size in place. Each change is a step on the run's recording. */
export function ViewportControls({ frame, onChange }: { frame: HTMLIFrameElement | null; onChange?: (viewport: PreviewViewport) => void }) {
  const [viewport, setViewport] = useState<PreviewViewport>({ width: 393, height: defaultViewportHeight, theme: 'light', textScale: 1 })
  const [device, setDevice] = useState('phone'), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const config = frame?.contentWindow?.reviewPreview?.config
    if (!config) return
    const next = { width: config.width, height: config.height ?? defaultViewportHeight, theme: config.theme, textScale: config.textScale }
    setViewport(next); setDevice(presetOf(next)?.id ?? '')
  }, [frame])
  const apply = async (next: PreviewViewport, id = device) => {
    setBusy(true); setError('')
    try {
      const preview = frame?.contentWindow?.reviewPreview
      if (!preview?.setViewport) throw Error('Open a live preview first.')
      const value = { ...next, ...(id ? { preset: id } : {}) }
      if (!id) delete value.preset
      await preview.setViewport(value)
      setViewport(value); setDevice(id); onChange?.(value)
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const choose = (id: string) => { const p = viewportPresets.find((row) => row.id === id)!; void apply({ ...viewport, width: p.width, height: p.height }, id) }
  const fold = () => {
    const id = device === 'unfolded' ? 'folded' : 'unfolded', p = viewportPresets.find((row) => row.id === id)!
    void apply({ ...viewport, ...(viewport.width > viewport.height ? { width: p.height, height: p.width } : { width: p.width, height: p.height }) }, id)
  }
  const category = viewport.width <= 500 ? 'phone' : viewport.width < 1000 ? 'tablet' : 'desktop'
  return <section className="rh-viewport-controls" aria-label="Responsive preview">
    <label>Viewport<NativeSelect className="cv:w-full" aria-label="Viewport category" disabled={!frame || busy} value={category} onChange={(event) => choose(event.target.value)}><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></NativeSelect></label>
    <label>Device<NativeSelect className="cv:w-full" aria-label="Preview device" disabled={!frame || busy} value={device} onChange={(event) => choose(event.target.value)}><option value="" disabled>Custom viewport</option>{(['phone', 'tablet', 'desktop'] as const).map((group) => <optgroup key={group} label={group[0]!.toUpperCase() + group.slice(1)}>{viewportPresets.filter((p) => p.group === group).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.width} × {p.height}</option>)}</optgroup>)}</NativeSelect></label>
    <label>Appearance<NativeSelect className="cv:w-full" aria-label="Preview appearance" disabled={!frame || busy} value={viewport.theme} onChange={(event) => void apply({ ...viewport, theme: event.target.value as PreviewViewport['theme'] })}><option value="light">Light</option><option value="dark">Dark</option></NativeSelect></label>
    <label>Text<NativeSelect className="cv:w-full" aria-label="Preview text size" disabled={!frame || busy} value={viewport.textScale} onChange={(event) => void apply({ ...viewport, textScale: Number(event.target.value) as 1 | 2 })}><option value={1}>Normal</option><option value={2}>Enlarged</option></NativeSelect></label>
    <Button variant="outline" disabled={!frame || busy} onClick={() => void apply({ ...viewport, width: viewport.height, height: viewport.width })}>Rotate viewport</Button>
    <Button variant="outline" disabled={!frame || busy} onClick={fold}>{device === 'unfolded' ? 'Fold viewport' : 'Unfold viewport'}</Button>
    <small>{viewport.width} × {viewport.height} CSS pixels. The app keeps its run and inputs; this is a browser viewport, not a physical device.</small>
    {error && <p role="alert">{error}</p>}
  </section>
}
