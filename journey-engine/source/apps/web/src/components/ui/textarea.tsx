import * as React from 'react'
import { cn } from '@/lib/utils'
import { inputVariants } from './input'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(inputVariants, 'min-h-24 py-2', className)} {...props} />
}

export { Textarea }
