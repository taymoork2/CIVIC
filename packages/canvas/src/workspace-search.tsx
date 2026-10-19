import { useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowRight, Layers, Search } from '@civic/shell/icons'
import { Dialog, DialogContent, DialogTitle } from '@civic/shell/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@civic/shell/ui/command'
import type { AppFlow, MapScreen } from './app-map'
import { projectShortcut } from './project-choice'

export type WorkspaceAction = { id: string; label: string; keywords?: string; icon: typeof Search; disabled?: boolean; opensDialog?: boolean; run: () => void }
type SearchItem = { id: string; label: string; detail: string; keywords: string; kind: 'flow' | 'screen' | 'action'; disabled?: boolean }

export function workspaceIndex(flows: AppFlow[]): SearchItem[] {
  return flows.flatMap(flow => [
    { id: `flow:${flow.id}`, label: flow.label, detail: flow.section, keywords: `${flow.section} journey flow`, kind: 'flow' as const },
    ...flow.screens.map(screen => ({ id: `screen:${screen.id}`, label: screen.label, detail: flow.label, keywords: `${flow.section} ${flow.label} ${screen.id} screen state`, kind: 'screen' as const })),
  ])
}

export function workspaceResults(items: SearchItem[], query: string): SearchItem[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  const matches: SearchItem[] = []
  for (const item of items) {
    const text = `${item.label} ${item.detail} ${item.keywords}`.toLocaleLowerCase()
    if (words.every(word => text.includes(word))) matches.push(item)
    if (matches.length === 10) break
  }
  return matches
}

export function WorkspaceSearch({ open, setOpen, name, flows, actions, focusFlow, focusScreen, loading, frame, canvas, trigger }: {
  open: boolean; setOpen: (open: boolean) => void; name: string; flows: AppFlow[]; actions: WorkspaceAction[]
  focusFlow: (id: string) => void; focusScreen: (screen: MapScreen) => void; loading: boolean; frame: HTMLIFrameElement | null
  canvas: RefObject<HTMLDivElement | null>; trigger: RefObject<HTMLButtonElement | null>
}) {
  const [query, setQuery] = useState('')
  const destination = useRef<'trigger' | 'canvas' | 'dialog'>('trigger')
  const index = useMemo(() => open ? workspaceIndex(flows) : [], [open, flows])
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!projectShortcut(event) || !open && document.querySelector('[role=dialog]')) return
    event.preventDefault(); event.stopPropagation(); setOpen(!open)
  })
  useEffect(() => { window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut) }, [])
  useEffect(() => {
    let win: Window | null = null
    const unbind = () => { try { win?.removeEventListener('keydown', shortcut, true) } catch {} win = null }
    const bind = () => {
      unbind()
      try { win = frame?.contentWindow ?? null; win?.addEventListener('keydown', shortcut, true) } catch { win = null }
    }
    bind(); frame?.addEventListener('load', bind)
    return () => { unbind(); frame?.removeEventListener('load', bind) }
  }, [frame])
  useEffect(() => { if (!open) setQuery(''); else destination.current = 'trigger' }, [open])
  const results = workspaceResults([...actions.map(action => ({ ...action, kind: 'action' as const, detail: 'Action', keywords: action.keywords ?? '' })), ...index], query)
  const select = (item: SearchItem) => {
    const action = item.kind === 'action' ? actions.find(action => action.id === item.id) : undefined
    destination.current = action?.opensDialog ? 'dialog' : 'canvas'
    setOpen(false)
    if (action) action.run()
    else if (item.kind === 'flow') focusFlow(item.id.slice(5))
    else { const screen = flows.flatMap(flow => flow.screens).find(screen => screen.id === item.id.slice(7)); if (screen) focusScreen(screen) }
  }
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent finalFocus={() => destination.current === 'dialog' ? false : destination.current === 'canvas' ? canvas.current : trigger.current} showCloseButton={false} className="civic-command-dialog cv:p-0 cv:gap-0 cv:w-[560px] cv:max-w-[calc(100vw-2rem)] cv:sm:max-w-[calc(100vw-2rem)]"><DialogTitle className="cv:sr-only">Search {name}</DialogTitle>
    <Command shouldFilter={false} label={`${name} commands`}><CommandInput autoFocus aria-label="Search this project" placeholder={`Search ${name}…`} value={query} onValueChange={setQuery} />
      <CommandList><CommandEmpty>{loading ? 'Loading this project…' : 'No matching journeys, screens, components or actions.'}</CommandEmpty>
        {(['action', 'flow', 'screen'] as const).map(kind => { const matches = results.filter(item => item.kind === kind); return matches.length > 0 && <CommandGroup key={kind} heading={kind === 'action' ? 'Actions' : kind === 'flow' ? 'Journeys & components' : 'Screens & states'}>{matches.map(item => {
          const Icon = kind === 'action' ? actions.find(action => action.id === item.id)!.icon : kind === 'flow' ? Layers : ArrowRight
          return <CommandItem key={item.id} value={item.id} disabled={item.disabled} onSelect={() => select(item)}><Icon aria-hidden="true" /><span>{item.label}</span>{kind !== 'action' && <small className="cv:max-w-32 cv:truncate">{item.detail}</small>}</CommandItem>
        })}</CommandGroup> })}
      </CommandList><div className="cv:flex cv:items-center cv:justify-between cv:border-t cv:border-border cv:px-4 cv:py-2 cv:text-xs cv:text-muted-foreground"><span>{name} · Current instance</span><kbd>Esc</kbd></div>
    </Command>
  </DialogContent></Dialog>
}
