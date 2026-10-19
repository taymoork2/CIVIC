import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RunControls } from '../run-controls'
import type { PreviewViewport } from '../viewport-presets'

function Standalone() {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null)
  const [applied, setApplied] = useState<PreviewViewport | null>(null)
  return <main className="rehearsal">
    <iframe title="Standalone notebook" sandbox="allow-scripts allow-same-origin allow-forms" onLoad={event => setFrame(event.currentTarget)} src="/review-frame.html?scenario=demo.home&width=640&height=800&theme=dark&scale=2" />
    <RunControls frame={frame} onViewportChange={setApplied} runSection={false} />
    <output aria-label="Last applied viewport">{JSON.stringify(applied)}</output>
  </main>
}

export default { pages: { standaloneViewport: async () => { createRoot(document.getElementById('review-root')!).render(<Standalone />) } } }
