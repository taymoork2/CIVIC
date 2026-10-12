import * as React from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="skeleton" className={cn('block rounded-field bg-surface-2 motion-safe:[animation:pulse_1.8s_ease-in-out_infinite]', className)} {...props} />
}

export { Skeleton }
