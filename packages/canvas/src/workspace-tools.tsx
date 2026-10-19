import { BookOpen, ChevronDown, ListChecks, MessageSquare, Monitor, PanelRight, Settings2, Smartphone, Tablet, X } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@civic/shell/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@civic/shell/ui/field'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@civic/shell/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@civic/shell/ui/toggle-group'
import { presetOf, viewportPresets, type PreviewViewport } from './viewport-presets'

export const workspacePanels = [
  { value: 'inspect', label: 'Inspect', icon: Settings2 },
  { value: 'review', label: 'Review', icon: MessageSquare },
  { value: 'contract', label: 'Contract', icon: BookOpen },
  { value: 'coverage', label: 'Coverage', icon: ListChecks },
] as const
export type WorkspacePanel = typeof workspacePanels[number]['value']

export function DetailsMenu({ pane, setPane, proposals }: { pane: WorkspacePanel | null; setPane: (pane: WorkspacePanel | null) => void; proposals: number }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" aria-label={pane ? `${pane[0]!.toUpperCase()}${pane.slice(1)} details` : 'Open details'} aria-controls="civic-details-panel" />}><PanelRight aria-hidden="true" /><span className="civic-details-label">{workspacePanels.find(item => item.value === pane)?.label ?? 'Details'}</span>{proposals > 0 && <small aria-label={`${proposals} new proposals`}>{proposals}</small>}<ChevronDown aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuLabel>Details panel</DropdownMenuLabel>{workspacePanels.map(({ value, label, icon: Icon }) => <DropdownMenuItem key={value} onClick={() => setPane(value)}><Icon aria-hidden="true" />{label}</DropdownMenuItem>)}</DropdownMenuGroup>{pane && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setPane(null)}><X aria-hidden="true" />Close details</DropdownMenuItem></>}</DropdownMenuContent>
  </DropdownMenu>
}

export function CanvasView({ viewport, busy, disabled, changeViewport, detail, changeDetail, live }: { viewport: PreviewViewport; busy: boolean; disabled: boolean; changeViewport: (id: string) => void; detail: string; changeDetail: (detail: string) => void; live: boolean }) {
  const DeviceIcon = viewport.width < 600 ? Smartphone : viewport.width < 1000 ? Tablet : Monitor
  return <Popover><PopoverTrigger render={<Button variant="ghost" aria-label={`View settings · ${presetOf(viewport)?.name ?? 'Custom viewport'}`} className="civic-view-trigger" />}><DeviceIcon aria-hidden="true" /><span>{presetOf(viewport)?.name ?? 'Custom'}</span><ChevronDown aria-hidden="true" /></PopoverTrigger>
    <PopoverContent align="end"><PopoverTitle>Canvas view</PopoverTitle><p className="cv:text-xs cv:text-muted-foreground">Web · {live ? 'Live preview' : 'Snapshots'}</p><FieldGroup>
      <Field><FieldLabel htmlFor="civic-viewport">Viewport</FieldLabel><NativeSelect id="civic-viewport" value={presetOf(viewport)?.id ?? ''} disabled={disabled || busy} onChange={event => changeViewport(event.target.value)} className="cv:w-full"><option value="" disabled>Custom viewport</option>{viewportPresets.filter(row => ['phone', 'tablet', 'desktop', 'wide-desktop'].includes(row.id)).map(row => <option key={row.id} value={row.id}>{row.name} · {row.width} × {row.height}</option>)}</NativeSelect></Field>
      <Field><FieldLabel>Canvas detail</FieldLabel><ToggleGroup aria-label="Canvas detail" value={[detail]} onValueChange={value => { if (value[0]) changeDetail(value[0]) }} variant="outline" spacing={0}><ToggleGroupItem value="compact">Compact flows</ToggleGroupItem><ToggleGroupItem value="all">All screens</ToggleGroupItem></ToggleGroup></Field>
    </FieldGroup></PopoverContent>
  </Popover>
}
