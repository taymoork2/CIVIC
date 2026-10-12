import * as React from 'react'
import { Drawer as SheetPrimitive } from '@base-ui/react/drawer'
import { cn } from '@/lib/utils'

/**
 * Base UI Drawer supplies modal focus management, scroll-aware swipe dismissal and exit lifecycle.
 * The app's `Sheet` (src/sheet.tsx) composes these and guards unsaved drafts.
 */
function SheetRoot(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetPortal(props: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetBackdrop({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return <SheetPrimitive.Backdrop data-slot="sheet-backdrop" className={cn(
    'sheet-backdrop fixed inset-0 z-50 [background:var(--sheet-scrim,var(--scrim))] [inset-block-start:env(safe-area-inset-top)]',
    '[opacity:calc(1_-_var(--drawer-swipe-progress,_0))] [transition:opacity_220ms_cubic-bezier(.32,_0,_.2,_1)]',
    'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[180ms] data-ending-style:[transition-timing-function:var(--ease-out)] data-swiping:duration-0 motion-reduce:transition-none',
    className as string,
  )} {...props} />
}

function SheetPopup({ className, ...props }: SheetPrimitive.Popup.Props) {
  return <SheetPrimitive.Viewport className="fixed inset-0 z-50">
    <SheetPrimitive.Popup data-slot="sheet-popup" className={cn('z-50', className as string)} {...props} />
  </SheetPrimitive.Viewport>
}

function SheetContent(props: SheetPrimitive.Content.Props) {
  return <SheetPrimitive.Content data-slot="sheet-content" {...props} />
}

function SheetTitle(props: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" {...props} />
}

function SheetDescription(props: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" {...props} />
}

function SheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

export { SheetRoot, SheetPortal, SheetBackdrop, SheetPopup, SheetContent, SheetTitle, SheetDescription, SheetClose }
