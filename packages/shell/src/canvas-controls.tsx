import { useCallback, useEffect, type RefObject } from 'react'
import { ChevronDown, Hand, Maximize, Minus, MousePointer2, Plus } from './icons'
import { Button } from './ui/button'
import { IconButton } from './ui/icon-button'
import { Separator } from './ui/separator'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuGroup, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from './ui/dropdown-menu'

export function canvasShortcut(event: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }, editable: boolean) {
  if (editable || event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.shiftKey && !['+', '='].includes(event.key)) return ({ '!': 'app', '1': 'app', '@': 'selection', '2': 'selection', ')': 'actual', '0': 'actual' } as Record<string, 'app' | 'selection' | 'actual'>)[event.key] ?? null
  return ({ v: 'select', h: 'hand', Escape: 'select', '+': 'in', '=': 'in', '-': 'out' } as Record<string, 'select' | 'hand' | 'in' | 'out'>)[event.key] ?? null
}

export function CanvasControls({ stage, pan, setPan, zoom, changeZoom, fitApp, fitSelection, fitFlow }: {
  stage: RefObject<HTMLDivElement | null>; pan: boolean; setPan: (pan: boolean) => void; zoom: number;
  changeZoom: (zoom: number) => void; fitApp: () => void; fitSelection: () => void; fitFlow: () => void;
}) {
  const tool = useCallback((hand: boolean) => { setPan(hand); stage.current?.focus({ preventScroll: true }) }, [setPan, stage])
  useEffect(() => {
    const root = stage.current?.closest('main'); if (!root) return
    const keydown = (event: KeyboardEvent) => {
      const action = canvasShortcut(event, Boolean((event.target as Element).closest('input,textarea,select,[contenteditable=true]')))
      if (!action) return
      event.preventDefault()
      if (action === 'select' || action === 'hand') tool(action === 'hand')
      else if (action === 'app') fitApp()
      else if (action === 'selection') fitSelection()
      else changeZoom(action === 'actual' ? 1 : Math.max(.003, Math.min(2, zoom * (action === 'in' ? 1.25 : .8))))
    }
    root.addEventListener('keydown', keydown)
    return () => root.removeEventListener('keydown', keydown)
  }, [zoom, fitApp, fitSelection, changeZoom, tool, stage])
  return <div className="civic-canvas-dock" aria-label="Canvas controls">
    <ToggleGroup aria-label="Canvas tools" value={[pan ? 'hand' : 'select']} onValueChange={value => { if (value.length) tool(value[0] === 'hand') }} spacing={0}>
      <Tooltip><TooltipTrigger render={<ToggleGroupItem value="select" aria-label="Select tool" />}><MousePointer2 aria-hidden="true" /></TooltipTrigger><TooltipContent>Select<kbd>V</kbd></TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger render={<ToggleGroupItem value="hand" aria-label="Hand tool" />}><Hand aria-hidden="true" /></TooltipTrigger><TooltipContent>Pan · hold Space over screens<kbd>H</kbd></TooltipContent></Tooltip>
    </ToggleGroup>
    <Separator orientation="vertical" className="cv:h-5" />
    <div className="civic-zoom-group" aria-label="Canvas zoom">
      <IconButton icon={Minus} label="Zoom out" shortcut="−" onClick={() => changeZoom(Math.max(.003, zoom * .8))} />
      <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" className="civic-zoom-value" aria-label="Zoom options" />}>{zoom < .01 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%<ChevronDown aria-hidden="true" /></DropdownMenuTrigger>
        <DropdownMenuContent side="top" sideOffset={12}>
          <DropdownMenuGroup><DropdownMenuLabel>Zoom</DropdownMenuLabel>
            <DropdownMenuItem onClick={fitApp}>Fit app<DropdownMenuShortcut>⇧ 1</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onClick={fitFlow}>Fit whole flow</DropdownMenuItem>
            <DropdownMenuItem onClick={fitSelection}>Fit selected screen<DropdownMenuShortcut>⇧ 2</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onClick={() => changeZoom(1)}>100%<DropdownMenuShortcut>⇧ 0</DropdownMenuShortcut></DropdownMenuItem>
          </DropdownMenuGroup><DropdownMenuSeparator /><p className="cv:px-2 cv:py-1.5 cv:text-xs cv:text-muted-foreground">Scroll to pan · Pinch to zoom</p>
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton icon={Plus} label="Zoom in" shortcut="+" onClick={() => changeZoom(Math.min(2, zoom * 1.25))} />
      <IconButton icon={Maximize} label="Fit whole flow" className="cv:max-[600px]:hidden" onClick={fitFlow} />
    </div>
  </div>
}
