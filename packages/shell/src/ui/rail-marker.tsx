import type { ReactNode } from 'react'
import { cn } from 'cn'

export function RailMarker({ children, active = false, className }: { children: ReactNode; active?: boolean; className?: string }) {
  return <span className={cn('civic-rail-marker', className)} data-active={active || undefined} aria-hidden="true">{children}</span>
}
