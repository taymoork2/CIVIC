import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, Plus, X } from '@civic/shell/icons'
import { IconButton } from '@civic/shell/ui/icon-button'
import { Tabs, TabsList, TabsTrigger } from '@civic/shell/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@civic/shell/ui/dropdown-menu'
import { notifications } from '@civic/shell/ui/notifications'
import type { AppearanceBridge } from '@civic/shell/theme'

export type DesktopTab = { id: string; appId: string; name: string; version: string; dirty: boolean }
export type DesktopState = { active?: string; tabs: DesktopTab[]; visible: boolean }
export type DesktopSelection = { appId: string; name: string; key: string; workspace?: string; scenario?: string }
declare global {
  interface Window {
    civicDesktop?: AppearanceBridge & {
      runtime?: { electron: string; chrome: string }
      state: () => Promise<DesktopState>
      subscribe: (listener: (state: DesktopState) => void) => () => void
      onFocusScenario: (listener: (id: string) => void) => () => void
      onSettings: (listener: () => void) => () => void
      isActive: () => boolean
      register: (input: { appId: string; name: string; key: string; version: string; dirty: boolean }) => Promise<unknown>
      setDraft: (name: string, dirty: boolean) => Promise<unknown> | undefined
      openProject: (input: DesktopSelection) => Promise<unknown>
      select: (id: string) => Promise<unknown>
      close: (id: string) => Promise<unknown>
    }
  }
}
const failure = (error: Error) => notifications.add({ title: 'Project tab unavailable', description: error.message })

export function useDesktopDraft(name: string, dirty: boolean) {
  useEffect(() => {
    void window.civicDesktop?.setDraft(name, dirty)?.catch(failure)
    return () => { void window.civicDesktop?.setDraft(name, false)?.catch(failure) }
  }, [name, dirty])
}

export function useDesktopProjects() {
  const [state, setState] = useState<DesktopState>({ tabs: [], visible: true })
  useEffect(() => {
    const api = window.civicDesktop
    if (!api) return
    const unsubscribe = api.subscribe(setState)
    void api.state().then(setState).catch(failure)
    return unsubscribe
  }, [])
  return state
}

export function DesktopProjectTabs({ state, openPicker, pickerTrigger }: { state: DesktopState; openPicker: () => void; pickerTrigger: RefObject<HTMLButtonElement | null> }) {
  const root = useRef<HTMLDivElement>(null)
  const [limit, setLimit] = useState(1)
  useEffect(() => {
    const element = root.current!
    const observer = new ResizeObserver(() => setLimit(Math.max(1, Math.floor((element.clientWidth - 80) / 168))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const visible = state.tabs.slice(0, limit)
  const current = state.tabs.find(tab => tab.id === state.active)
  if (current && !visible.includes(current)) visible[visible.length - 1] = current
  const hidden = state.tabs.filter(tab => !visible.includes(tab))
  return <div ref={root} className="civic-desktop-tabs">
    <Tabs value={state.active ?? ''} onValueChange={id => { void window.civicDesktop?.select(id).catch(failure) }} className="cv:min-w-0 cv:flex-1">
      <TabsList variant="line" aria-label="Open project checkouts" className="cv:h-auto cv:min-h-12 cv:w-full cv:justify-start cv:p-0">
        {visible.map(tab => <div key={tab.id} className="civic-desktop-tab"><TabsTrigger value={tab.id} title={`${tab.name} · ${tab.version}`} className="cv:h-12 cv:min-w-0 cv:flex-1 cv:justify-start"><span className="cv:grid cv:min-w-0 cv:gap-0.5 cv:text-left"><span className="cv:truncate">{tab.name}</span><small className="cv:truncate">{tab.version || 'Opening…'}</small></span>{tab.dirty && <span aria-label="Live run or unsaved edits">●</span>}</TabsTrigger><IconButton icon={X} label={`Close ${tab.name} · ${tab.version || 'project'}`} onClick={() => { void window.civicDesktop?.close(tab.id).catch(failure) }} /></div>)}
      </TabsList>
    </Tabs>
    {hidden.length > 0 && <DropdownMenu><DropdownMenuTrigger render={<IconButton icon={ChevronDown} label="More project tabs" />} /><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuLabel>Open checkouts</DropdownMenuLabel>{hidden.map(tab => <DropdownMenuItem key={tab.id} onClick={() => { void window.civicDesktop?.select(tab.id).catch(failure) }}><span>{tab.name} · {tab.version}</span></DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>}
    <IconButton ref={pickerTrigger} icon={Plus} label="Open project or checkout" onClick={openPicker} />
  </div>
}
