import { Badge } from '@civic/shell/ui/badge'
import { useRef } from 'react'
import { ChevronDown, ChevronRight, PanelLeft, Search, X } from '@civic/shell/icons'
import { Button } from '@civic/shell/ui/button'
import { IconButton } from '@civic/shell/ui/icon-button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@civic/shell/ui/input-group'
import { RailMarker } from '@civic/shell/ui/rail-marker'
import { SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem } from '@civic/shell/ui/sidebar'
import type { AppFlow, MapScreen } from './app-map'

export function outlineRows(flows: AppFlow[], query: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return flows.map(flow => ({ flow, screens: flow.screens.map((screen, index) => ({ screen, index })).filter(({ screen }) => {
    const text = `${flow.section} ${flow.label} ${screen.label}`.toLocaleLowerCase()
    return words.every(word => text.includes(word))
  }) })).filter(row => row.screens.length)
}

export function JourneyOutline({ flows, sections, query, setQuery, focused, expanded, viewed, liveScreen, focus, focusScreen, close }: {
  flows: AppFlow[]; sections: string[]; query: string; setQuery: (query: string) => void
  focused: string; expanded: string | null; viewed: string | null; liveScreen?: string
  focus: (id: string) => void; focusScreen: (screen: MapScreen) => void; close: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const rows = outlineRows(flows, query), filtering = Boolean(query.trim())
  const clear = () => { setQuery(''); input.current?.focus() }
  return <>
    <SidebarHeader className="cv:flex-row cv:items-center cv:gap-1"><InputGroup className="cv:min-w-0 cv:flex-1">
      <InputGroupInput ref={input} aria-label="Filter journeys and screens" placeholder="Filter…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); clear() } }} />
      <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
      {query && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-sm" aria-label="Clear navigation filter" onClick={clear}><X aria-hidden="true" /></InputGroupButton></InputGroupAddon>}
    </InputGroup><IconButton icon={PanelLeft} label="Hide navigation" onClick={close} className="cv:min-[1180px]:hidden" /></SidebarHeader>
    <SidebarContent>
    {filtering && !rows.length && <p role="status" className="cv:px-2 cv:text-sm cv:text-muted-foreground">No matching journeys or screens.</p>}
    {sections.map(section => {
      const children = rows.filter(row => row.flow.section === section)
      return children.length > 0 && <SidebarGroup className="app-nav-section" key={section}><SidebarGroupLabel>{section}</SidebarGroupLabel><SidebarMenu>{children.map(({ flow, screens }) => {
        const open = filtering || expanded === flow.id
        return <SidebarMenuItem key={flow.id}>
          <Button variant={focused === flow.id ? 'secondary' : 'ghost'} className="cv:h-auto cv:w-full cv:justify-between cv:whitespace-normal cv:text-left" aria-expanded={open} aria-current={focused === flow.id ? 'location' : undefined} onClick={() => focus(flow.id)}><span className="cv:flex cv:items-center cv:gap-1">{open ? <ChevronDown className="cv:size-3 cv:shrink-0" aria-hidden="true" /> : <ChevronRight className="cv:size-3 cv:shrink-0" aria-hidden="true" />}{flow.label}</span><small>{screens.length}</small></Button>
          {open && <ol className="app-screen-outline">{screens.map(({ screen, index }) => <li key={screen.id}><Button variant={viewed === screen.id ? 'secondary' : 'ghost'} className="cv:h-auto cv:w-full cv:justify-start cv:gap-3 cv:whitespace-normal cv:text-left" aria-current={viewed === screen.id ? 'page' : undefined} onClick={() => focusScreen(screen)}><RailMarker active={viewed === screen.id}>{String(index + 1).padStart(2, '0')}</RailMarker><span className="cv:flex-1">{screen.label}</span>{liveScreen === screen.id && <Badge variant="outline" className="cv:text-[var(--civic-positive)]">Live</Badge>}</Button></li>)}</ol>}
        </SidebarMenuItem>
      })}</SidebarMenu></SidebarGroup>
    })}</SidebarContent>
  </>
}
