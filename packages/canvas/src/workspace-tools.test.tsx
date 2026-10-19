import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CanvasControls } from '@civic/shell/canvas-controls'
import { TooltipProvider } from '@civic/shell/ui/tooltip'
import { CanvasView, DetailsMenu } from './workspace-tools'

test('one canvas dock exposes both tools and zoom with accessible names', () => {
  const html = renderToStaticMarkup(<TooltipProvider><CanvasControls stage={{ current: null }} pan={false} setPan={() => {}} zoom={.003} changeZoom={() => {}} fitApp={() => {}} fitFlow={() => {}} fitSelection={() => {}} /></TooltipProvider>)
  expect(html.match(/aria-label="Canvas controls"/g)).toHaveLength(1)
  for (const name of ['Select tool', 'Hand tool', 'Zoom out', 'Zoom in', 'Zoom options', 'Fit whole flow']) expect(html).toContain(`aria-label="${name}"`)
  expect(html).toContain('aria-pressed="true"')
  expect(html).toContain('0.3')
})

test('details and viewport triggers describe the current selection', () => {
  expect(renderToStaticMarkup(<DetailsMenu pane="coverage" setPane={() => {}} proposals={2} />)).toContain('aria-label="Coverage details"')
  expect(renderToStaticMarkup(<DetailsMenu pane={null} setPane={() => {}} proposals={0} />)).toContain('aria-label="Open details"')
  const html = renderToStaticMarkup(<CanvasView viewport={{ width: 393, height: 852, theme: 'light', textScale: 1 }} busy={false} disabled={false} changeViewport={() => {}} detail="all" changeDetail={() => {}} live={false} />)
  expect(html).toContain('aria-label="View settings · Phone"')
})
