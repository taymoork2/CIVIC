import { createContext, useContext, useState, useSyncExternalStore, type ComponentProps } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@civic/shell/ui/sheet'

const container = createContext<HTMLDivElement | null>(null)
const narrow = () => window.innerWidth < 1180
const subscribe = (listener: () => void) => { window.addEventListener('resize', listener); return () => window.removeEventListener('resize', listener) }

export function WorkspaceBody({ children, ...props }: ComponentProps<'div'>) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  return <container.Provider value={root}><div ref={setRoot} {...props}>{children}</div></container.Provider>
}

export function WorkspaceRail({ side, open, onOpenChange, title, children, className, ...props }: Omit<ComponentProps<typeof SheetContent>, 'title' | 'side'> & {
  side: 'left' | 'right'; open: boolean; onOpenChange: (open: boolean) => void; title: string
}) {
  const root = useContext(container)
  const modal = useSyncExternalStore(subscribe, narrow, () => false)
  return <><div className="civic-rail-slot" data-side={side} hidden={!open} aria-hidden="true" />
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal} disablePointerDismissal={!modal}>
      <SheetContent side={side} portalProps={{ container: root, keepMounted: true, className: 'cv:contents' }} overlayProps={{ hidden: !modal || !open }} showCloseButton={false} initialFocus={modal} finalFocus={modal} hidden={!open} role={modal ? 'dialog' : 'complementary'} className={`civic-workspace-rail cv:absolute cv:shadow-none cv:data-[side=left]:w-64 cv:data-[side=right]:w-80 cv:data-[side=right]:max-[600px]:w-full cv:data-closed:hidden ${className ?? ''}`} {...props}>
        <SheetTitle className="cv:sr-only">{title}</SheetTitle>{children}
      </SheetContent>
    </Sheet>
  </>
}
