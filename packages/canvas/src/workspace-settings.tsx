import { useEffect, useRef, useState, version as reactVersion } from 'react'
import { ArrowUpRight } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@civic/shell/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldTitle } from '@civic/shell/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@civic/shell/ui/toggle-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@civic/shell/ui/tabs'
import { Separator } from '@civic/shell/ui/separator'
import { Table, TableBody, TableRow, TableHead, TableCell } from '@civic/shell/ui/table'
import { setThemePreference, useShellTheme, type ThemePreference } from '@civic/shell/theme'
import { useWorkspaceShortcut } from './use-workspace-shortcut'

export function WorkspaceSettings({ open, setOpen, frame, canvasDetail, changeDetail, projectName, onConnections }: {
  open: boolean; setOpen: (open: boolean) => void; frame: HTMLIFrameElement | null
  canvasDetail: string; changeDetail: (detail: string) => void; projectName: string; onConnections: () => void
}) {
  const theme = useShellTheme()
  const [saving, setSaving] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const connections = useRef(false)
  const modifier = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'
  const shortcuts = [
    ['Search this project', `${modifier} K`], ['CIVIC settings', `${modifier} ,`],
    ['Select / Hand tool', 'V / H'], ['Pan temporarily', 'Hold Space'],
    ['Fit app', 'Shift 1'], ['Fit selected screen', 'Shift 2'], ['Actual size', 'Shift 0'],
    ['Zoom in / out', '+ / −'], ['Close dialog', 'Esc'],
  ]
  useWorkspaceShortcut(',', event => {
    event.preventDefault(); event.stopPropagation()
    if (!open) returnFocus.current = event.target as HTMLElement
    setOpen(true)
  }, frame)
  useEffect(() => window.civicDesktop?.onSettings(() => { returnFocus.current = document.activeElement as HTMLElement; setOpen(true) }), [setOpen])
  return <Dialog open={open} onOpenChange={setOpen} onOpenChangeComplete={isOpen => {
    if (!isOpen) {
      if (connections.current) {
        connections.current = false; returnFocus.current = null
        requestAnimationFrame(onConnections)
        return
      }
      const target = returnFocus.current
      // Restore focus after the dialog releases the preview or underlying modal.
      requestAnimationFrame(() => {
        if (target?.isConnected && !document.querySelector('.civic-settings-dialog')) target.focus({ preventScroll: true })
        if (returnFocus.current === target) returnFocus.current = null
      })
    }
  }}><DialogContent className="civic-settings-dialog cv:sm:max-w-[480px]" finalFocus={() => connections.current ? false : returnFocus.current?.isConnected ? returnFocus.current.ownerDocument === document ? returnFocus.current : false : document.querySelector<HTMLElement>('.civic-details-trigger')}>
    <DialogHeader className="cv:pr-10"><DialogTitle className="cv:m-0">CIVIC settings</DialogTitle><DialogDescription className="cv:sr-only">Appearance, canvas defaults and application information.</DialogDescription></DialogHeader>
    <Tabs defaultValue="general"><TabsList className="cv:w-full cv:max-[600px]:min-h-[50px]" aria-label="Settings sections"><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="shortcuts">Shortcuts</TabsTrigger><TabsTrigger value="about">About</TabsTrigger></TabsList>
    <TabsContent value="general" className="cv:pt-3"><FieldGroup className="cv:gap-4"><Field aria-labelledby="civic-appearance-title"><FieldTitle id="civic-appearance-title">Appearance</FieldTitle>
      <ToggleGroup aria-label="Appearance" aria-describedby="civic-appearance-description" value={[theme.preference]} disabled={saving} variant="outline" spacing={0} className="cv:w-full" onValueChange={values => {
        const value = values[0] as ThemePreference | undefined
        if (!value) return
        setSaving(true); void setThemePreference(value).finally(() => setSaving(false))
      }}>{(['system', 'light', 'dark'] as const).map(value => <ToggleGroupItem key={value} value={value} className="cv:flex-1">{value[0].toUpperCase() + value.slice(1)}</ToggleGroupItem>)}</ToggleGroup>
      <FieldDescription id="civic-appearance-description" className="cv:m-0">{theme.preference === 'system' ? `Following your system’s ${theme.resolved} appearance.` : `${theme.preference === 'dark' ? 'Dark' : 'Light'} appearance.`}</FieldDescription>
      {theme.error && <p role="status" className="cv:text-sm cv:text-muted-foreground">{theme.error}</p>}
    </Field><Separator />
    <Field aria-labelledby="civic-canvas-default-title"><FieldTitle id="civic-canvas-default-title">Canvas defaults</FieldTitle>
      <ToggleGroup aria-label="App overview" aria-describedby="civic-canvas-default-description" value={[canvasDetail]} variant="outline" spacing={0} className="cv:w-full" onValueChange={values => { if (values[0]) changeDetail(values[0]) }}>
        <ToggleGroupItem value="compact" className="cv:flex-1">Compact flows</ToggleGroupItem><ToggleGroupItem value="all" className="cv:flex-1">All screens</ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription id="civic-canvas-default-description" className="cv:m-0">App overview · applied now and remembered.</FieldDescription>
    </Field><Separator />
    <Field orientation="horizontal" className="cv:justify-between cv:gap-2"><span className="cv:min-w-0 cv:truncate cv:text-sm cv:text-muted-foreground" title={projectName}>{projectName}</span><Button variant="ghost" size="sm" onClick={() => { connections.current = true; setOpen(false) }}>Project connections<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></Button></Field>
    </FieldGroup></TabsContent>
    <TabsContent value="shortcuts" className="cv:pt-3"><FieldGroup className="cv:gap-3"><FieldDescription className="cv:m-0">Canvas shortcuts apply outside text fields and previews.</FieldDescription>
      <Table aria-label="Keyboard shortcuts"><TableBody>{shortcuts.map(([label, keys]) => <TableRow key={label}><TableHead scope="row" className="cv:font-normal">{label}</TableHead><TableCell className="cv:text-right"><kbd className="cv:whitespace-nowrap cv:font-mono cv:text-xs cv:text-muted-foreground">{keys}</kbd></TableCell></TableRow>)}</TableBody></Table>
      <Separator /><FieldDescription className="cv:m-0">Scroll to pan · Pinch to zoom</FieldDescription>
    </FieldGroup></TabsContent>
    <TabsContent value="about" className="cv:pt-3"><FieldGroup className="cv:gap-4"><Field><FieldTitle>About CIVIC</FieldTitle><FieldDescription className="cv:m-0">Local-first project review.</FieldDescription></Field><Separator />
      <Field><FieldTitle>Runtime</FieldTitle><FieldDescription className="cv:m-0">{window.civicDesktop?.runtime ? `Electron ${window.civicDesktop.runtime.electron} · Chromium ${window.civicDesktop.runtime.chrome}` : window.civicDesktop ? 'Electron' : 'Browser'}<br />React {reactVersion}</FieldDescription></Field>
      <FieldDescription className="cv:m-0">CIVIC appearance and canvas preferences are separate from the app you’re previewing.</FieldDescription>
    </FieldGroup></TabsContent></Tabs>
  </DialogContent></Dialog>
}
