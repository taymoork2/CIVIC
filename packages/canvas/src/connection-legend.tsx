import { Button } from '@civic/shell/ui/button'
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle } from '@civic/shell/ui/popover'
import { ConnectionMarker } from './connection-paths'
import { connectionStyle, type PathAction } from './connection-semantics'

const examples: PathAction[] = [
  { action: 'Navigate', interaction: 'navigate' },
  { action: 'Action / update', interaction: 'update' },
  { action: 'Back / cancel', interaction: 'return' },
  { action: 'Conditional', interaction: 'navigate', when: 'A declared condition is met' },
]

export function ConnectionLegend() {
  return <Popover><PopoverTrigger render={<Button variant="ghost" size="sm" />}>Connections</PopoverTrigger><PopoverContent side="top" align="start" className="cv:w-80 cv:max-w-[calc(100vw-2rem)] cv:p-4"><PopoverTitle>Connection meanings</PopoverTitle><div role="group" aria-label="Connection meanings" className="cv:grid cv:gap-2 cv:text-sm">
    <p>Arrowheads point to the destination, regardless of its position.</p>
    {examples.map((example, index) => { const style = connectionStyle(example), id = `legend-arrow-${index}`; return <div className="cv:flex cv:items-center cv:gap-2" key={example.action}><svg width="48" height="20" viewBox="0 0 48 20" aria-hidden="true"><defs><ConnectionMarker id={id} interaction={style.interaction} /></defs><path d="M 2 10 L 40 10" fill="none" stroke={style.stroke} strokeDasharray={style.strokeDasharray} strokeWidth="1.5" markerEnd={`url(#${id})`} /></svg><span>{example.action}</span></div> })}
    <p>Types use declared metadata or action labels. Thicker lines mark captured visits.</p>
  </div></PopoverContent></Popover>
}
