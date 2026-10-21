import { BookOpen, ChevronDown, ListChecks, MessageSquare, Monitor, PanelRight, Settings2, Smartphone, Tablet, X } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@civic/shell/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@civic/shell/ui/field'
import { Input } from '@civic/shell/ui/input'
import { NativeSelect } from '@civic/shell/ui/native-select'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@civic/shell/ui/popover'
import { presetOf, viewportPresets, type PreviewViewport } from './viewport-presets'

export const workspacePanels = [
  { value: 'inspect', label: 'Inspect', icon: Settings2 },
  { value: 'review', label: 'Review', icon: MessageSquare },
  { value: 'contract', label: 'Contract', icon: BookOpen },
  { value: 'coverage', label: 'Coverage', icon: ListChecks },
] as const
export type WorkspacePanel = typeof workspacePanels[number]['value']

export function PreviewThemeControls({ viewport, themes, disabled, change }: {
  viewport: PreviewViewport; themes?: { id: string; label: string }[]; disabled: boolean; change: (patch: Partial<PreviewViewport>) => void
}) {
  return <div className="civic-preview-themes">
    <NativeSelect size="sm" aria-label="Canvas appearance" title="Preview appearance" disabled={disabled} value={viewport.appearance ?? viewport.theme} onChange={event => change({ appearance: event.target.value as PreviewViewport['appearance'] })}>
      <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
    </NativeSelect>
    {themes?.length ? <NativeSelect size="sm" className="cv:max-w-36" aria-label="App theme" title="Application theme" disabled={disabled} value={viewport.appTheme ?? themes[0]!.id} onChange={event => change({ appTheme: event.target.value })}>
      {themes.map(theme => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
    </NativeSelect> : null}
  </div>
}

export function DetailsMenu({ pane, setPane, proposals, onSettings }: { pane: WorkspacePanel | null; setPane: (pane: WorkspacePanel | null) => void; proposals: number; onSettings?: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button className="civic-details-trigger" variant="ghost" aria-label={pane ? `${pane[0]!.toUpperCase()}${pane.slice(1)} details` : 'Open details'} aria-controls="civic-details-panel" />}><PanelRight aria-hidden="true" /><span className="civic-details-label">{workspacePanels.find(item => item.value === pane)?.label ?? 'Details'}</span>{proposals > 0 && <small aria-label={`${proposals} new proposals`}>{proposals}</small>}<ChevronDown aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuLabel>Details panel</DropdownMenuLabel>{workspacePanels.map(({ value, label, icon: Icon }) => <DropdownMenuItem key={value} onClick={() => setPane(value)}><Icon aria-hidden="true" />{label}</DropdownMenuItem>)}</DropdownMenuGroup>{pane && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setPane(null)}><X aria-hidden="true" />Close details</DropdownMenuItem></>}{onSettings && <><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onClick={onSettings}><Settings2 aria-hidden="true" />CIVIC settings<kbd className="cv:ml-auto cv:text-xs cv:text-muted-foreground">{navigator.platform.includes('Mac') ? '⌘,' : 'Ctrl+,'}</kbd></DropdownMenuItem></DropdownMenuGroup></>}</DropdownMenuContent>
  </DropdownMenu>
}

export function ViewportPicker({ viewport, busy, disabled, reason, changeViewport }: { viewport: PreviewViewport; busy: boolean; disabled: boolean; reason?: string; changeViewport: (size: Pick<PreviewViewport, 'width' | 'height' | 'preset'>) => void }) {
  const preset = presetOf(viewport), dimensions = `${viewport.width} × ${viewport.height}`
  const group = preset?.group ?? (viewport.width < 600 ? 'phone' : viewport.width < 1000 ? 'tablet' : 'desktop')
  const DeviceIcon = group === 'phone' ? Smartphone : group === 'tablet' ? Tablet : Monitor
  return <Popover><PopoverTrigger render={<Button variant="ghost" aria-label={`Viewport · ${preset?.name ?? 'Custom'} · ${dimensions}`} title={`${preset?.name ?? 'Custom viewport'} · ${dimensions}`} className="civic-view-trigger" />}><DeviceIcon aria-hidden="true" /><span className="cv:max-w-40 cv:truncate">{preset?.name ?? dimensions}</span><ChevronDown aria-hidden="true" /></PopoverTrigger>
    <PopoverContent align="end" className="cv:gap-3 cv:p-3"><PopoverTitle className="cv:sr-only">Viewport</PopoverTitle>
      <Field><FieldLabel htmlFor="civic-viewport" className="cv:sr-only">Device</FieldLabel><NativeSelect id="civic-viewport" value={preset?.id ?? ''} disabled={disabled || busy} onChange={event => { const next = viewportPresets.find(row => row.id === event.target.value); if (next) changeViewport({ ...next, preset: next.id }) }} className="cv:w-full"><option value="" disabled>Custom size</option>{(['phone', 'tablet', 'desktop'] as const).map(group => <optgroup key={group} label={group === 'phone' ? 'Phones' : group === 'tablet' ? 'Tablets' : 'Desktops'}>{viewportPresets.filter(row => row.group === group).map(row => <option key={row.id} value={row.id}>{row.name} · {row.width} × {row.height}</option>)}</optgroup>)}</NativeSelect></Field>
      <form key={dimensions} onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        changeViewport({ width: Number(values.get('width')), height: Number(values.get('height')), preset: undefined })
      }}><FieldGroup><FieldGroup className="cv:flex-row cv:items-end cv:gap-2">
        <Field className="cv:min-w-0 cv:gap-1"><FieldLabel htmlFor="civic-viewport-width" className="cv:text-xs cv:text-muted-foreground">Width (px)</FieldLabel><Input id="civic-viewport-width" name="width" type="number" min={200} max={1920} step={1} required defaultValue={viewport.width} disabled={disabled || busy} /></Field>
        <Field className="cv:min-w-0 cv:gap-1"><FieldLabel htmlFor="civic-viewport-height" className="cv:text-xs cv:text-muted-foreground">Height (px)</FieldLabel><Input id="civic-viewport-height" name="height" type="number" min={200} max={1600} step={1} required defaultValue={viewport.height} disabled={disabled || busy} /></Field>
        <Button type="submit" variant="secondary" disabled={disabled || busy}>{busy ? 'Applying…' : 'Apply'}</Button>
      </FieldGroup></FieldGroup></form>
      {reason && <p role="status" className="cv:text-xs cv:text-muted-foreground">{reason}</p>}
    </PopoverContent>
  </Popover>
}
