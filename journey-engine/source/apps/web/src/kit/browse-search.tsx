import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { SearchField } from '@/closet/closet-parts'
import { DesignIcon } from '@/kit/design-icons'

const compactTouch = '(pointer: coarse) and (max-width: 45rem)'

/** Root browsing only. Forms keep their ordinary, always-visible SearchField. */
export function BrowseSearch({ label, placeholder, value, onChange, summary, actions }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void;
  summary: ReactNode; actions: ReactNode;
}) {
  const id = useId()
  const field = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [focusRequested, setFocusRequested] = useState(false)
  const pinned = value !== ''
  useEffect(() => {
    if (focusRequested) {
      field.current?.querySelector('input')?.focus()
      setFocusRequested(false)
    }
  }, [focusRequested])
  useEffect(() => {
    const media = window.matchMedia(compactTouch)
    let start: { x: number; y: number } | null = null
    const available = () => media.matches && !document.querySelector('.app-shell[inert], dialog[open], [role="dialog"]')
    const begin = (event: TouchEvent) => {
      const touch = event.touches[0]
      start = available() && window.scrollY <= 4 && event.touches.length === 1 && touch
        ? { x: touch.clientX, y: touch.clientY } : null
    }
    const move = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!start || !touch || !available() || event.touches.length !== 1) { start = null; return }
      const down = touch.clientY - start.y
      if (Math.abs(touch.clientX - start.x) > Math.abs(down) || down < -8) { start = null; return }
      if (down >= 48) { setOpen(true); start = null }
    }
    const end = () => { start = null }
    const scroll = () => {
      if (!open || pinned || !available() || field.current?.contains(document.activeElement)) return
      // Collapse only after the field leaves view; native scroll anchoring keeps the current row steady.
      if (field.current && field.current.getBoundingClientRect().bottom < -80) setOpen(false)
    }
    window.addEventListener('touchstart', begin, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    window.addEventListener('touchcancel', end, { passive: true })
    window.addEventListener('scroll', scroll, { passive: true })
    return () => {
      window.removeEventListener('touchstart', begin)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
      window.removeEventListener('scroll', scroll)
    }
  }, [open, pinned])
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
    <div id={id} ref={field} className={open || pinned ? 'min-w-0' : 'min-w-0 [@media_(pointer:_coarse)_and_(max-width:_45rem)]:hidden'}>
      <SearchField label={label} value={value} placeholder={placeholder} onChange={onChange} />
    </div>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      {summary}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {open || pinned ? null : <Button type="button" variant="ghost" size="icon" className="hidden [@media_(pointer:_coarse)_and_(max-width:_45rem)]:inline-flex" aria-label={label} aria-controls={id} aria-expanded={false} onClick={() => { setOpen(true); setFocusRequested(true) }}>
          <DesignIcon name="search" size="1em" aria-hidden="true" />
        </Button>}
        {actions}
      </div>
    </div>
  </div>
}
