import { cn } from '@/lib/utils'
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { sheetText } from '@/copy'
import { Button } from '@/components/ui/button'
import { SheetBackdrop, SheetContent, SheetPopup, SheetPortal, SheetRoot, SheetTitle } from '@/components/ui/sheet'
import { DesignIcon } from '@/kit/design-icons'
import { FormProgress } from '@/kit/form-progress'

const parentSheet = createContext<Dispatch<SetStateAction<number>> | null>(null)

const sheetFootRowClassName = cn(
  "sheet-foot-row",
  "flex gap-2",
)

const sheetClassName = cn(
  "sheet",
  "fixed min-w-0 w-[100dvw] max-w-[36rem] max-h-[90dvh] m-[auto_auto_0] p-0 border-0 bg-surface text-ink shadow-[var(--shadow-lg)] flex-col overflow-hidden [container-type:inline-size]",
  "[inset:auto_0_0]",
  "[border-radius:1.5rem_1.5rem_0_0]",
  "flex outline-none",
  "[transform:translateY(var(--drawer-swipe-movement-y,_0px))] [transition:transform_220ms_cubic-bezier(.32,_0,_.2,_1),_opacity_220ms_cubic-bezier(.32,_0,_.2,_1)]",
  "data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)] data-ending-style:duration-[180ms] data-ending-style:[transition-timing-function:var(--ease-out)] data-swiping:select-none",
  "min-[45rem]:data-starting-style:[transform:scale(.96)] min-[45rem]:data-ending-style:[transform:scale(.96)] min-[45rem]:data-starting-style:opacity-0 min-[45rem]:data-ending-style:opacity-0",
  "motion-reduce:animate-none motion-reduce:transition-none",
  "[&.is-tall]:h-[90dvh] [&.is-tall]:max-h-[90dvh]",
  "[&.is-tall.has-compact-actions]:h-[fit-content]",
  "min-[45rem]:[inset:0]",
  "min-[45rem]:w-[35rem] min-[45rem]:max-w-[35rem] min-[45rem]:h-fit min-[45rem]:max-h-[86dvh] min-[45rem]:m-auto min-[45rem]:rounded-[1.5rem]",
  "min-[45rem]:[&.is-tall]:h-[86dvh] min-[45rem]:[&.is-tall]:max-h-[86dvh]",
)

const sheetHeadClassName = cn(
  "sheet-head",
  // 28 above the title clears the grab handle; the close icon sits at the top end on every sheet.
  "relative min-w-0 flex-none grid grid-cols-[minmax(0,1fr)] gap-1 p-[1.75rem_var(--space-5)_var(--space-2)] pe-[calc(var(--space-5)_+_3.5rem)]",
  "[.has-photo-header_&]:isolate [.has-photo-header_&]:bg-surface [@container_(width_>=_16rem)]:[.has-photo-header_&]:min-h-[220px] [@container_(width_>=_16rem)]:[.has-photo-header_&]:content-end [@container_(width_>=_16rem)]:[.has-photo-header_&]:p-[8rem_var(--space-5)_var(--space-2)]",
  "[.has-icon-header_&]:isolate [.has-icon-header_&]:bg-surface-2 [@container_(width_>=_16rem)]:[.has-icon-header_&]:min-h-[168px] [@container_(width_>=_16rem)]:[.has-icon-header_&]:content-end [@container_(width_>=_16rem)]:[.has-icon-header_&]:pt-[6rem]",
  // Enlarged text needs the header's full width; context moves into the scrolling body.
  "[@container_(width_<_16rem)]:min-h-0 [@container_(width_<_16rem)]:pt-[calc(var(--space-3)_+_3.75rem)] [@container_(width_<_16rem)]:pe-[var(--space-5)]",
)

const sheetHandleClassName = cn(
  "sheet-handle",
  "pointer-events-none absolute start-1/2 top-2 h-[5px] w-10 -translate-x-1/2 rounded-[3px] [background:var(--line)]",
  "[.has-photo-header_&]:[background:rgba(255,255,255,.85)]",
)

const sheetHeaderArtClassName = cn(
  "sheet-header-art",
  "absolute [@container_(width_<_16rem)]:hidden",
  "[inset:0]",
  "[z-index:-1]",
  // The photo fades into the sheet surface behind the title.
  "after:absolute after:[inset:0] after:[content:''] after:[background:linear-gradient(180deg,rgba(0,0,0,0)_30%,var(--surface-fade)_62%,var(--sheet)_100%)]",
  "[&_>_img]:w-full [&_>_img]:h-full [&_>_img]:object-cover",
  "[&_>_img]:[object-position:center_40%]",
)

const sheetBackClassName = cn(
  "sheet-back",
  "absolute inline-grid place-items-center size-11 p-0 rounded-control text-ink [inset-block-start:var(--space-3)] [inset-inline-start:var(--space-3)]",
  "bg-surface-2 active:[background:color-mix(in_srgb,_var(--surface-2)_85%,_var(--ink))] [@media_(hover:_hover)_and_(pointer:_fine)]:hover:[background:color-mix(in_srgb,_var(--surface-2)_92%,_var(--ink))]",
  "[&_svg]:size-5",
)

const sheetTitleRowClassName = cn(
  "sheet-title-row",
  "flex min-w-0 items-center gap-3",
)

const sheetMediaClassName = cn(
  "sheet-media",
  "absolute start-1/2 top-[40%] grid size-[72px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-card bg-surface text-ink shadow-[var(--e1)]",
  "[&_svg]:size-9",
)

const sheetKickerClassName = cn(
  "sheet-kicker",
  "m-0 text-ink-2 text-[length:var(--step--1)] leading-[1.45] [overflow-wrap:anywhere] [@container_(width_<_16rem)]:hidden",
)

const sheetTitleClassName = cn(
  "sheet-title",
  "font-text leading-[1.25] font-semibold",
  "text-[length:var(--step-3)]",
  "[overflow-wrap:break-word]",
  "[&:focus]:[outline:none]",
  "[.has-photo-header_&]:max-w-[28ch] [.has-photo-header_&]:text-balance",
)

const sheetSubClassName = cn(
  "sheet-sub",
  "text-ink-2 leading-normal",
  "text-[length:var(--step-0)]",
  "[.has-photo-header_&]:text-[length:.875rem]",
  "[@container_(width_<_16rem)]:hidden",
)

const sheetCloseIconClassName = cn(
  "sheet-close-icon",
  "absolute inline-grid place-items-center size-11 min-w-[2.75rem] min-h-[2.75rem] p-0 rounded-control text-ink [&_svg]:size-[1.125rem]",
  "bg-surface-2 active:[background:color-mix(in_srgb,_var(--surface-2)_85%,_var(--ink))] [@media_(hover:_hover)_and_(pointer:_fine)]:hover:[background:color-mix(in_srgb,_var(--surface-2)_92%,_var(--ink))]",
  "[inset-block-start:var(--space-3)]",
  "[inset-inline-end:var(--space-3)]",
  "[.has-photo-header_&]:[background:rgba(255,253,249,.92)] [.has-photo-header_&]:[color:#20231f] [.has-photo-header_&]:[border:1px_solid_rgba(255,255,255,.85)]",
  "[.has-photo-header_&]:active:[background:#eeece5] [@media_(hover:_hover)_and_(pointer:_fine)]:[.has-photo-header_&]:hover:[background:#eeece5]",
  "[.has-photo-header_&]:focus-visible:[outline-color:#20231f]",
  "motion-safe:active:scale-[.96]",
)

const sheetDiscardClassName = cn(
  "sheet-discard",
  "grid w-full min-w-0 gap-2 p-[var(--space-3)_var(--space-4)] rounded-[1rem] bg-conflict-bg text-conflict-ink",
  "[&_button:focus-visible]:[outline-color:var(--conflict-ink)]",
  "motion-safe:[animation:fade-in_var(--dur-step)_var(--ease-out)]",
)

const sheetBodyClassName = cn(
  "sheet-body",
  "min-w-0 grid content-start gap-4 p-[var(--space-2)_var(--space-5)_var(--space-5)]",
)

const sheetScrollClassName = cn(
  "sheet-scroll min-h-0 min-w-0 [flex:1_1_auto] overflow-y-auto [overscroll-behavior:contain]",
  "[.sheet.has-compact-actions_&]:[flex:0_1_auto]",
)

const sheetFootClassName = cn(
  "sheet-foot",
  "min-w-0 flex-none grid gap-2 p-[var(--space-3)_var(--space-5)_max(var(--space-6),_env(safe-area-inset-bottom))] [border-block-start:1px_solid_var(--line)] bg-surface",
  "empty:hidden",
  "[&:has(>button+button)]:grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] [&>button]:min-w-0 [&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:py-2 [&>:not(button)]:col-span-full",
  "[.sheet.has-compact-actions_&]:flex [.sheet.has-compact-actions_&]:flex-wrap [.sheet.has-compact-actions_&]:justify-end [.sheet.has-compact-actions_&]:items-center [.sheet.has-compact-actions_&]:p-[var(--space-3)_var(--space-5)_max(var(--space-6),_env(safe-area-inset-bottom))]",
)

/** What a dismissal does: a sheet holding an unsaved draft asks before discarding it. */
export function dismissalFor(dirty: boolean): 'close' | 'confirm-discard' {
  return dirty ? 'confirm-discard' : 'close'
}

/** A new step of a multi-step sheet opens at its top, not wherever the last step was scrolled to. */
export function scrollToTop(body: { scrollTop: number } | null): void {
  if (body !== null) body.scrollTop = 0
}

/**
 * While a draft is unsaved, leaving or reloading the page asks first. Browsers show their own
 * generic "Leave site?" prompt and ignore any message, so nothing here can claim the draft is kept.
 * Returns the cleanup that removes the listener; a clean sheet registers nothing.
 */
export function warnBeforeUnload(target: Pick<Window, 'addEventListener' | 'removeEventListener'>, dirty: boolean): () => void {
  if (!dirty) return () => undefined
  const warn = (event: BeforeUnloadEvent) => {
    event.preventDefault()
    // Older Chromium and Safari only prompt when returnValue is set; its text is never shown.
    event.returnValue = ''
  }
  target.addEventListener('beforeunload', warn)
  return () => target.removeEventListener('beforeunload', warn)
}

/** The browser's close watcher (Android Back, and Escape on desktop Chromium), where it exists. */
type CloseWatcherLike = { oncancel: ((event: Event) => void) | null; onclose: (() => void) | null; destroy: () => void }
type CloseWatcherConstructor = new () => CloseWatcherLike

export function closeWatcherConstructor(scope: object = globalThis): CloseWatcherConstructor | null {
  const constructor = (scope as { CloseWatcher?: unknown }).CloseWatcher
  return typeof constructor === 'function' ? constructor as CloseWatcherConstructor : null
}

/**
 * System Back (Android's back gesture or button, Escape on desktop) asks the top sheet to close,
 * as a modal `<dialog>` does. Each sheet holds one close watcher, so one Back press reaches only the
 * newest sheet. Nothing touches history, so Back never pops a route as well as closing the sheet.
 * With an unsaved draft Back asks first. When the browser skips the cancelable step (no tap since
 * the last Back), the watcher closes anyway and a fresh one is armed, so a draft is never dropped.
 */
export function watchSystemBack(Watcher: CloseWatcherConstructor, attempt: () => 'closed' | 'asked'): () => void {
  let watcher: CloseWatcherLike | null = null
  let stopped = false
  // A cancel that could not be refused still ends in close: that close reuses the cancel's answer.
  let answered: 'closed' | 'asked' | null = null
  const arm = () => {
    const next = new Watcher()
    next.oncancel = (event) => {
      const answer = attempt()
      // Refusing keeps this watcher armed; a closed sheet unmounts and destroys it.
      if (event.cancelable) event.preventDefault()
      else answered = answer
    }
    next.onclose = () => {
      if (stopped || watcher !== next) return
      watcher = null
      const answer = answered ?? attempt()
      answered = null
      // The browser closed the watcher without letting us refuse: keep the sheet and keep Back working.
      if (answer === 'asked' && !stopped) arm()
    }
    watcher = next
  }
  arm()
  return () => {
    stopped = true
    watcher?.destroy()
    watcher = null
  }
}

/**
 * A Base UI Drawer (a centred modal from 720px up), so the page behind is inert and focus stays inside
 * it. It closes on a downward swipe, Escape, system Back (through the browser's close watcher), on
 * a tap on the dimmed page, and on its header Close button. Back and record Edit sit top left.
 *
 * The parent owns whether it is open: render it to open it, and stop rendering it in `onClose`.
 * Focus returns to whatever had it before the sheet opened.
 */
export function Sheet({ title, kicker, subtitle, progress, headerArt, media, mediaTint, onClose, onBack, onEdit, editLabel = 'Edit', closeLabel = sheetText.close, footer, tall = false, compactActions = false, closeAtTop = false, step, dirty = false, busy = false, initialFocus, titleId: givenTitleId, className, children }: {
  className?: string
  title: string
  /** A small line above the title: what the record belongs to ("from Washer 3", a household's name). */
  kicker?: ReactNode
  subtitle?: ReactNode
  progress?: { step: number; total: number }
  /** The object's icon, shown large on a tinted band above the title when there is no photo. */
  media?: ReactNode
  /** A palette color for the object's icon band; photos keep their own composed header. */
  mediaTint?: string
  /** A composed image header; the title retains its accessible heading. */
  headerArt?: ReactNode
  onClose: () => void
  /** A step back inside a multi-step sheet; shown beside Close. */
  onBack?: () => void
  /** Edit this saved record, beside Back when present. */
  onEdit?: () => void
  editLabel?: string
  closeLabel?: string
  /** The sheet's own actions, above Close. */
  footer?: ReactNode
  /** A fixed-height sheet for work that stays open across steps or tabs. */
  tall?: boolean
  /** Compact, side-by-side actions for setup and editing forms. */
  compactActions?: boolean
  /**
   * Every sheet now has the header close icon. With a custom `closeLabel` (a choice such as
   * "Keep this load") a footer button of that name remains too unless this is set.
   */
  closeAtTop?: boolean
  /** Names the step a multi-step sheet is on: when it changes, the body scrolls back to the top. */
  step?: string
  /**
   * The sheet holds an unsaved draft. Close, Escape, the back gesture and a backdrop tap then ask
   * "Discard your changes?" in the footer instead of closing; nothing is saved either way.
   */
  dirty?: boolean
  /** A submitted write is still pending; dismissal cannot cancel or discard that operation. */
  busy?: boolean
  /** The control to focus as the sheet opens, instead of its heading; the heading when it returns null. */
  initialFocus?: () => HTMLElement | null
  /** The heading's id, so content such as a grid of choices can be named by the real title. */
  titleId?: string
  children?: ReactNode
}) {
  const ownTitleId = useId()
  const titleId = givenTitleId ?? ownTitleId
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const keepEditing = useRef<HTMLButtonElement>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [entered, setEntered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [swipeDisabled, setSwipeDisabled] = useState(false)
  const parent = useContext(parentSheet)
  const [nestedSheets, setNestedSheets] = useState(0)
  // Count mounted children so Edit stays disabled through their closing animation.
  useLayoutEffect(() => {
    if (parent === null) return
    parent((count) => count + 1)
    return () => parent((count) => count - 1)
  }, [parent])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const busyRef = useRef(busy)
  busyRef.current = busy
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Every dismissal goes through here so an unsaved draft is never dropped without asking.
  const attemptClose = (): 'closed' | 'asked' => {
    if (busyRef.current || dismissalFor(dirtyRef.current) === 'confirm-discard') {
      setConfirmingDiscard(true)
      return 'asked'
    }
    // Keep the parent mounted until the drawer has finished sliding out.
    setClosing(true)
    return 'closed'
  }
  // Where a close watcher exists it owns Escape too, so Base UI's own Escape is ignored (one attempt per press).
  const attemptRef = useRef(attemptClose)
  attemptRef.current = attemptClose
  const watcherOwnsEscape = closeWatcherConstructor() !== null
  // A draft that became clean again (the person undid their edit) needs no confirmation.
  const showDiscard = confirmingDiscard && (dirty || busy)

  // The portal must contain the popup before opening. Otherwise its async mount can miss Base
  // UI's starting-style frame and URL-selected drawers appear instantly.
  const openWhenReady = useCallback((popup: HTMLElement | null) => {
    if (popup !== null) setEntered(true)
  }, [])

  useLayoutEffect(() => {
    const media = window.matchMedia('(min-width: 45rem) and (hover: hover) and (pointer: fine)')
    const touch = window.matchMedia('(any-pointer: coarse)')
    const update = () => setSwipeDisabled(media.matches && !touch.matches)
    update()
    media.addEventListener('change', update)
    touch.addEventListener('change', update)
    return () => {
      media.removeEventListener('change', update)
      touch.removeEventListener('change', update)
    }
  }, [])

  useLayoutEffect(() => {
    if (showDiscard) keepEditing.current?.focus({ preventScroll: true })
  }, [showDiscard])

  useEffect(() => {
    if (!showDiscard || busy || closing) return
    const timer = window.setTimeout(() => {
      setConfirmingDiscard(false)
      heading.current?.focus({ preventScroll: true })
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [showDiscard, busy, closing])

  useLayoutEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const Watcher = closeWatcherConstructor()
    const stop = Watcher === null ? () => undefined : watchSystemBack(Watcher, () => attemptRef.current())
    return () => {
      stop()
      before?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => warnBeforeUnload(window, dirty), [dirty])

  // Opening focus belongs to the popup (`initialFocus`); later steps move focus to the new heading.
  const opened = useRef(false)
  useLayoutEffect(() => {
    scrollToTop(body.current)
    if (opened.current && step !== undefined) heading.current?.focus({ preventScroll: true })
    opened.current = true
  }, [step])
  const initialFocusRef = useRef(initialFocus)
  initialFocusRef.current = initialFocus
  const focusOnOpen = useCallback(() => initialFocusRef.current?.() ?? heading.current, [])

  // The header icon always closes. A footer button of its own name stays only when it says something other than "Close".
  const footerClose = !closeAtTop && closeLabel !== sheetText.close
  const closeButton = <Button type="button" className={cn("secondary sheet-close")} disabled={busy} onClick={attemptClose}>{closeLabel}</Button>
  const closeRow = compactActions ? closeButton : <div className={sheetFootRowClassName}>{closeButton}</div>

  const discardPrompt = (
    <div className={sheetDiscardClassName} role="alert">
      <p className={cn("font-semibold")}>{sheetText.discardTitle}</p>
      <div className="grid min-w-0 grid-cols-2 gap-2 [@container_(width_<_16rem)]:grid-cols-1">
        <Button ref={keepEditing} type="button" variant="alert" className="h-auto min-h-12 min-w-0 whitespace-normal px-2 py-2 leading-snug" onClick={() => { setConfirmingDiscard(false); heading.current?.focus({ preventScroll: true }) }}>{sheetText.keepEditing}</Button>
        <Button type="button" variant="destructive" className="h-auto min-h-12 min-w-0 whitespace-normal px-2 py-2 leading-snug" onClick={() => setClosing(true)}>{sheetText.discard}</Button>
      </div>
    </div>
  )

  return (
    <parentSheet.Provider value={setNestedSheets}>
    <SheetRoot open={entered && !closing} swipeDirection="down" onOpenChange={(open, details) => {
      if (open) return
      if (details.reason === 'escape-key' && watcherOwnsEscape) { details.cancel(); return }
      if (attemptClose() === 'asked') details.cancel()
    }} onOpenChangeComplete={(open) => { if (!open && closing) closeRef.current() }}>
      <SheetPortal keepMounted>
        <SheetBackdrop />
        <SheetPopup ref={openWhenReady} initialFocus={focusOnOpen} aria-labelledby={titleId} data-base-ui-swipe-ignore={swipeDisabled ? '' : undefined} className={cn(sheetClassName, tall ? ' is-tall' : '', compactActions ? ' has-compact-actions' : '', headerArt !== undefined ? ' has-photo-header' : media !== undefined ? ' has-icon-header' : '', className)}>
          {/* Keep the grab area outside scrolling content so dragging it works at any scroll position. */}
          <div hidden={swipeDisabled} className="absolute start-1/2 top-0 z-10 h-6 w-20 -translate-x-1/2" aria-hidden="true">
            <span className={sheetHandleClassName} />
          </div>
          <header className={cn(sheetHeadClassName, ' has-close-icon', headerArt === undefined && media === undefined ? onBack === undefined && onEdit === undefined && progress === undefined ? '[@container_(width_<_16rem)]:pt-[calc(var(--space-3)_+_3.75rem)] [@container_(width_<_16rem)]:pe-[var(--space-5)]' : 'pt-[calc(var(--space-3)_+_3.75rem)] pe-[var(--space-5)]' : '')}>
            {headerArt === undefined ? null : <div className={sheetHeaderArtClassName} aria-hidden="true">{headerArt}</div>}
            {headerArt !== undefined || media === undefined ? null : <div className={sheetHeaderArtClassName} style={mediaTint === undefined ? undefined : { background: `color-mix(in srgb, ${mediaTint} 70%, var(--surface))` }} aria-hidden="true"><span className={sheetMediaClassName}>{media}</span></div>}
            {/* A step back inside the sheet sits top left, apart from Close. */}
            {onBack === undefined ? null : (
              <Button type="button" variant="unstyled" size="unstyled" className={sheetBackClassName} aria-label={sheetText.back} onClick={onBack}>
                <DesignIcon name="chevronLeft" size="1em" strokeWidth={2.2} aria-hidden="true"  />
              </Button>
            )}
            {onEdit === undefined ? null : <Button type="button" variant="unstyled" size="unstyled" className={cn(sheetBackClassName, 'sheet-edit [&:disabled]:opacity-45')} style={onBack === undefined ? undefined : { insetInlineStart: 'calc(var(--space-3) + 2.75rem + 4px)' }} aria-label={editLabel} title={editLabel} disabled={busy || nestedSheets > 0} onClick={onEdit}><DesignIcon name="pencil" size="1em" aria-hidden="true" /></Button>}
            <div className={sheetTitleRowClassName}>
              <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                {kicker === undefined ? null : <p className={sheetKickerClassName}>{kicker}</p>}
                <SheetTitle id={titleId} ref={heading} tabIndex={-1} className={sheetTitleClassName}>{title}</SheetTitle>
              </div>
            </div>
            {subtitle === undefined ? null : <p className={sheetSubClassName}>{subtitle}</p>}
            {progress === undefined ? null : <div className="absolute top-[var(--space-3)] start-[calc(var(--space-3)_+_3.25rem)] end-[calc(var(--space-3)_+_3.25rem)] flex min-h-11 items-center justify-center"><FormProgress {...progress} /></div>}
            <Button type="button" variant="unstyled" size="unstyled" className={sheetCloseIconClassName} aria-label={sheetText.close} onClick={attemptClose}><DesignIcon name="x" size="1em" strokeWidth={2.2} aria-hidden="true"  /></Button>
          </header>
          <div ref={body} className={sheetScrollClassName}>
          <SheetContent className={sheetBodyClassName}>
            {kicker === undefined && subtitle === undefined ? null : <div className="hidden min-w-0 gap-1 text-ink-2 [overflow-wrap:anywhere] [@container_(width_<_16rem)]:grid">
              {kicker === undefined ? null : <p className="m-0 text-[length:var(--step--1)] leading-[1.45]">{kicker}</p>}
              {subtitle === undefined ? null : <p className="m-0 text-[length:var(--step-0)] leading-normal">{subtitle}</p>}
            </div>}
            {children}
          </SheetContent>
          </div>
          <footer className={sheetFootClassName} data-base-ui-swipe-ignore>
            {showDiscard ? busy ? <p role="status">Saving changes…</p> : discardPrompt : <>
              {compactActions && footerClose ? closeRow : null}
              {footer}
              {compactActions || !footerClose ? null : closeRow}
            </>}
          </footer>
        </SheetPopup>
      </SheetPortal>
    </SheetRoot>
    </parentSheet.Provider>
  )
}
