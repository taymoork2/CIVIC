import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DesignIcon } from '@/kit/design-icons'

const taskFooterClassName = cn(
  "task-footer",
  "fixed z-20 mx-auto grid w-full max-w-[45rem] gap-2 px-4 pt-3 pb-[max(32px,env(safe-area-inset-bottom))] order-last",
  "inset-x-0 bottom-0 rounded-none",
  // On a root page the floating dock stays; the footer rides just above it instead of under it.
  "[.app-shell:has(.tabs):not(.is-focus)_&]:[inset-block-end:calc(var(--bar-bottom)_+_var(--bar-h)_+_var(--space-2))]",
  "[.app-shell:has(.tabs):not(.is-focus)_&]:inset-x-4 [.app-shell:has(.tabs):not(.is-focus)_&]:w-auto [.app-shell:has(.tabs):not(.is-focus)_&]:max-w-[calc(45rem_-_2rem)] [.app-shell:has(.tabs):not(.is-focus)_&]:rounded-card [.app-shell:has(.tabs):not(.is-focus)_&]:py-3",
  "[background:var(--glass)]",
  // Task text scrolls behind this fixed action area; keep it from ghosting through the labels.
  "[.app-shell.is-focus_&]:[background:var(--glass-solid)]",
  "[-webkit-backdrop-filter:blur(16px)_saturate(1.5)]",
  "[backdrop-filter:blur(16px)_saturate(1.5)]",
  "shadow-[var(--glass-hi)]",
  "[border:1px_solid_var(--glass-border)]",
  "[@supports_not_((backdrop-filter:_blur(1px))_or_(-webkit-backdrop-filter:_blur(1px)))]:[background:var(--glass-solid)]",
  "[@media_(prefers-reduced-transparency:_reduce),_(prefers-contrast:_more)]:[background:var(--glass-solid)]",
  "[@media_(prefers-reduced-transparency:_reduce),_(prefers-contrast:_more)]:[backdrop-filter:none]",
  "[@media_(prefers-reduced-transparency:_reduce),_(prefers-contrast:_more)]:[-webkit-backdrop-filter:none]",
  "[@media_(prefers-contrast:_more)]:[border:1.5px_solid_var(--ink)]",
  // A sheet owns its footer placement and gutters; task actions stay inside that footer.
  "[.sheet_&]:static [.sheet_&]:m-0 [.sheet_&]:w-full [.sheet_&]:max-w-none [.sheet_&]:p-0 [.sheet_&]:border-0 [.sheet_&]:rounded-none [.sheet_&]:bg-transparent [.sheet_&]:shadow-none [.sheet_&]:backdrop-filter-none [.sheet_&]:[-webkit-backdrop-filter:none]",
  "[:root[data-material='tonal']_&]:bg-surface-2 [:root[data-material='tonal']_&]:shadow-none",
  "[:root[data-material='tonal']_&]:[backdrop-filter:none]",
  "[:root[data-material='tonal']_&]:[-webkit-backdrop-filter:none]",
)
const taskFooterRowClassName = 'flex min-w-0 items-center gap-2 [&_>_:last-child]:min-w-0 [&_>_:last-child]:flex-1 [&_>_:last-child]:[overflow-wrap:anywhere]'
const inlineFooterClassName = 'task-footer grid min-w-0 grid-cols-[minmax(0,1fr)] max-h-[50dvh] w-full shrink-0 gap-2 overflow-y-auto [scroll-padding-block-end:max(32px,env(safe-area-inset-bottom))] border-0 [border-block-start:1px_solid_var(--line)] bg-surface px-4 pt-3 pb-[max(32px,env(safe-area-inset-bottom))]'
const summaryFooterClassName = cn(taskFooterClassName, '@min-[48rem]:static @min-[48rem]:m-0 @min-[48rem]:max-w-none @min-[48rem]:rounded-card @min-[48rem]:pb-4')
const taskFooterNoteClassName = 'm-0 max-w-none text-center leading-[1.45] text-muted-foreground text-[length:var(--step--1)]'
const taskFooterLinksClassName = 'flex flex-wrap justify-center gap-2 -mt-1 [&_>_*]:flex-1 [&_>_*]:min-h-[44px] [&_>_*]:font-semibold [&_>_*]:text-[length:var(--step-1)]'

/**
 * Task actions: overlay glass by default, an account row, or a responsive task summary.
 * An optional note, quieter secondary links, then the primary action (with an optional
 * previous step beside it).
 */
export function TaskFooter({ placement = 'overlay', note, previous, secondary, children }: {
  placement?: 'overlay' | 'inline' | 'summary'
  note?: ReactNode
  previous?: { label: string; onClick: () => void }
  secondary?: ReactNode
  children: ReactNode
}) {
  const footerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const footer = footerRef.current
    const main = footer?.closest<HTMLElement>('.app-main')
    if (placement === 'inline' || !footer || !main || footer.closest('.sheet')) return
    let clearance = ''
    // The same clearance pads the page and tells scrolling (focus, find, scrollIntoView) to stop above the footer.
    const root = document.documentElement
    const apply = () => {
      main.style.setProperty('--task-footer-clearance', clearance)
      root.style.scrollPaddingBottom = clearance
    }
    const measure = () => {
      if (getComputedStyle(footer).position !== 'fixed') {
        clearance = '0px'
        apply()
        return
      }
      const bounds = footer.getBoundingClientRect()
      clearance = `${Math.ceil(bounds.height + Math.max(0, window.innerHeight - bounds.bottom) + 16)}px`
      apply()
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(footer)
    const tabs = main.closest('.app-shell')?.querySelector('.tabs')
    if (tabs) observer?.observe(tabs)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      if (main.style.getPropertyValue('--task-footer-clearance') === clearance) main.style.removeProperty('--task-footer-clearance')
      if (root.style.scrollPaddingBottom === clearance) root.style.removeProperty('scroll-padding-bottom')
    }
  }, [placement])
  return (
    <div ref={footerRef} className={placement === 'inline' ? inlineFooterClassName : placement === 'summary' ? summaryFooterClassName : taskFooterClassName} data-slot="task-footer">
      {note === undefined || note === null || note === false ? null : <p className={taskFooterNoteClassName}>{note}</p>}
      {secondary === undefined || secondary === null ? null : <div className={taskFooterLinksClassName}>{secondary}</div>}
      <div className={taskFooterRowClassName}>
        {previous === undefined ? null : (
          <Button variant="secondary" size="icon-lg" className="flex-none shadow-[var(--glass-hi)]" type="button" aria-label={previous.label} onClick={previous.onClick}><DesignIcon name="chevronLeft" size="1em" strokeWidth={2.2} aria-hidden="true"  /></Button>
        )}
        {children}
      </div>
    </div>
  )
}
