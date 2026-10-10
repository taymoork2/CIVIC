import type { ReactNode } from 'react'

/** Reflow the same task controls; resizing never replaces a draft or its focused input. */
export function TaskLayout({ children }: {
  children: ReactNode
}) {
  return <div className="task-layout grid min-w-0 items-start gap-5 @min-[48rem]:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] @min-[48rem]:gap-8">
    {children}
  </div>
}
