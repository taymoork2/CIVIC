import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { useRender } from '@base-ui/react/use-render'
import { mergeProps } from '@base-ui/react/merge-props'
import { cn } from '@/lib/utils'

/** shadcn Badge, with WashCloset's status tones. Every tone carries words, never color alone. */
const badgeVariants = cva(
  'inline-flex w-fit max-w-full shrink-0 items-center justify-center gap-1.5 whitespace-normal [overflow-wrap:anywhere] rounded-mark border-0 px-2 min-h-6 font-semibold text-[length:var(--step--1)] [&_svg]:pointer-events-none [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'text-foreground [box-shadow:inset_0_0_0_1px_var(--line)]',
        ready: 'bg-ready-bg text-ready-ink',
        waiting: 'bg-hamper-bg text-hamper-ink',
        washing: 'bg-washing-bg text-washing-ink',
        drying: 'bg-hanging-bg text-hanging-ink',
        confirm: 'bg-hamper-bg text-hamper-ink',
        conflict: 'bg-conflict-bg text-conflict-ink',
        // A grouped label (prototype: radius 20, 32px, secondary fill), not a status mark.
        label: 'min-h-8 rounded-label bg-secondary px-3 text-secondary-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, render, ...props }: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>({ className: cn(badgeVariants({ variant }), className) }, props, { 'data-slot': 'badge', 'data-variant': variant ?? 'default' } as never),
  })
}

export { Badge, badgeVariants }
