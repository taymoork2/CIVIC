import * as React from 'react'
import { cn } from '@/lib/utils'

const inputVariants = 'min-h-12 w-full min-w-0 rounded-field border border-border bg-card px-3.5 py-0 text-[length:var(--step-1)] placeholder:text-muted-foreground placeholder:opacity-100 focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  const classes = type === 'checkbox' || type === 'radio' ? 'size-5 shrink-0 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50' : type === 'file' ? 'w-full text-base file:min-h-11 file:rounded-control file:border-0 file:bg-muted file:px-3 file:text-foreground' : inputVariants
  return <input type={type} data-slot="input" className={cn(classes, className)} {...props} />
}

export { Input, inputVariants }
