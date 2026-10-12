import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** shadcn Alert. `confirm` (amber) needs a person to check a fact; `conflict` (rust) means recorded facts can't be used together. */
const alertVariants = cva(
  'relative grid w-full gap-0.5 rounded-[1rem] p-[10px_12px_4px] text-start',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground [box-shadow:inset_0_0_0_1px_var(--line)]',
        // Text inside a tinted box uses the box ink, because dark mode uses bright fills.
        confirm: 'bg-hamper-bg text-hamper-ink [--ink:var(--hamper-ink)] [--ink-2:var(--hamper-ink)] [&_[data-slot=alert-description]]:opacity-85',
        conflict: 'bg-conflict-bg text-conflict-ink [--ink:var(--conflict-ink)] [--ink-2:var(--conflict-ink)] [&_[data-slot=alert-description]]:opacity-85',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('flex items-center gap-1.5 font-semibold leading-[1.3] text-[length:var(--step-0)]', className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('ps-3 opacity-85 leading-[1.45] text-[length:var(--step--1)]', className)} {...props} />
}

function AlertActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-actions" className={cn('flex flex-wrap gap-2 pt-0.5 pb-2 ps-3', className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription, AlertActions, alertVariants }
