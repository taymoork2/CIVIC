import { Button } from '@civic/shell/ui/button'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { defaultViewportHeight, presetOf, viewportPresets, type PreviewViewport } from './viewport-presets'
import { usePreviewViewport, type ViewportController } from './use-preview-viewport'
import { supportsPreview } from './connection-readiness'

/** Changes a live preview's viewport, appearance and text size in place. Each change is a step on the run's recording. */
export function ViewportControls({ frame, onChange, controller }: { frame: HTMLIFrameElement | null; onChange?: (viewport: PreviewViewport) => void; controller?: ViewportController }) {
  return controller ? <ViewportFields frame={frame} controller={controller} /> : <StandaloneViewportControls frame={frame} onChange={onChange} />
}

function StandaloneViewportControls({ frame, onChange }: { frame: HTMLIFrameElement | null; onChange?: (viewport: PreviewViewport) => void }) {
  const controller = usePreviewViewport({ getFrame: () => frame, initial: { width: 393, height: defaultViewportHeight, theme: 'light', textScale: 1 }, liveOnly: true, onChange })
  return <ViewportFields frame={frame} controller={controller} standalone />
}

function ViewportFields({ frame, controller: { viewport, busy, error, change }, standalone = false }: { frame: HTMLIFrameElement | null; controller: ViewportController; standalone?: boolean }) {
  const disabled = busy || !supportsPreview(frame?.contentWindow?.reviewPreview, 'resize')
  const device = presetOf(viewport)?.id ?? ''
  const choose = (id: string) => { const p = viewportPresets.find(row => row.id === id); if (p) void change({ width: p.width, height: p.height }) }
  const fold = () => {
    const id = device === 'unfolded' ? 'folded' : 'unfolded', p = viewportPresets.find((row) => row.id === id)!
    void change(viewport.width > viewport.height ? { width: p.height, height: p.width } : { width: p.width, height: p.height })
  }
  const category = viewport.width <= 500 ? 'phone' : viewport.width < 1000 ? 'tablet' : 'desktop'
  return <section className="rh-viewport-controls" aria-label="Responsive preview">
    {standalone && <><label>Viewport<NativeSelect className="cv:w-full" aria-label="Viewport category" disabled={disabled} value={category} onChange={(event) => choose(event.target.value)}><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></NativeSelect></label>
    <label>Device<NativeSelect className="cv:w-full" aria-label="Preview device" disabled={disabled} value={device} onChange={(event) => choose(event.target.value)}><option value="" disabled>Custom viewport</option>{(['phone', 'tablet', 'desktop'] as const).map((group) => <optgroup key={group} label={group[0]!.toUpperCase() + group.slice(1)}>{viewportPresets.filter((p) => p.group === group).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.width} × {p.height}</option>)}</optgroup>)}</NativeSelect></label></>}
    <label>Appearance<NativeSelect className="cv:w-full" aria-label="Preview appearance" disabled={disabled} value={viewport.theme} onChange={(event) => void change({ theme: event.target.value as PreviewViewport['theme'] })}><option value="light">Light</option><option value="dark">Dark</option></NativeSelect></label>
    <label>Text<NativeSelect className="cv:w-full" aria-label="Preview text size" disabled={disabled} value={viewport.textScale} onChange={(event) => void change({ textScale: Number(event.target.value) as 1 | 2 })}><option value={1}>Normal</option><option value={2}>Enlarged</option></NativeSelect></label>
    <Button variant="outline" disabled={disabled} onClick={() => void change({ width: viewport.height, height: viewport.width })}>Rotate viewport</Button>
    <Button variant="outline" disabled={disabled} onClick={fold}>{device === 'unfolded' ? 'Fold viewport' : 'Unfold viewport'}</Button>
    <small>{viewport.width} × {viewport.height} CSS pixels. The app keeps its run and inputs; this is a browser viewport, not a physical device.</small>
    {standalone && error && <p role="alert">{error}</p>}
  </section>
}
