import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { useRender } from '@base-ui/react/use-render'
import { mergeProps } from '@base-ui/react/merge-props'
import { cn } from '@/lib/utils'

/** shadcn Item: the one row shape for garments, products, washers and people. */
function ItemGroup({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul role="list" data-slot="item-group" className={cn('group/item-group flex flex-col [container-type:inline-size] bg-card rounded-card shadow-[var(--shadow-sm)] overflow-hidden', className)} {...props} />
}

function ItemSeparator({ className, ...props }: React.ComponentProps<'hr'>) {
  return <hr data-slot="item-separator" className={cn('m-0 border-0 [border-block-start:1px_solid_var(--line)]', className)} {...props} />
}

const itemVariants = cva(
  cn(
    'group/item flex w-full items-center gap-3 border-0 bg-transparent text-foreground text-start [transition:background-color_var(--dur-press)_var(--ease-out)] focus-visible:outline-offset-[-3px] [a]:no-underline',
    // When text grows, give it a full line instead of squeezing it between two fixed slots.
    '[@container_(width_<_16rem)]:[&:has([data-slot=item-media])]:grid [@container_(width_<_16rem)]:[&:has([data-slot=item-media])]:grid-cols-[minmax(0,1fr)_auto]',
    '[@container_(width_<_16rem)]:[&:has([data-slot=item-media])]:gap-[12px] [@container_(width_<_16rem)]:[&:has([data-slot=item-media])]:px-[16px] [@container_(width_<_16rem)]:[&:has([data-slot=item-media])]:py-[12px]',
    '[@container_(width_<_16rem)]:[&:has([data-slot=item-media])_>[data-slot=item-content]]:col-span-2 [@container_(width_<_16rem)]:[&:has([data-slot=item-media])_>[data-slot=item-content]]:row-start-2',
    '[@container_(width_<_16rem)]:[&:has([data-slot=item-media])_>svg]:col-start-2 [@container_(width_<_16rem)]:[&:has([data-slot=item-media])_>svg]:row-start-1',
    '[@container_(width_<_16rem)]:[&:has([data-slot=item-media])_>[data-slot=item-actions]]:col-start-2 [@container_(width_<_16rem)]:[&:has([data-slot=item-media])_>[data-slot=item-actions]]:row-start-1',
  ),
  {
    variants: {
      variant: {
        default: '',
        interactive: 'cursor-pointer active:bg-muted [@media_(hover:_hover)_and_(pointer:_fine)]:hover:bg-muted',
      },
      size: {
        default: 'min-h-16 py-3 ps-4 pe-3',
        sm: 'min-h-12 px-4 py-2',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Item({ className, variant, size, render, ...props }: useRender.ComponentProps<'div'> & VariantProps<typeof itemVariants>) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>({ className: cn(itemVariants({ variant, size }), className) }, props, { 'data-slot': 'item', 'data-variant': variant ?? 'default', 'data-size': size ?? 'default' } as never),
  })
}

const itemMediaVariants = cva(
  'relative flex flex-none items-center justify-center [&_svg]:pointer-events-none [@container_(width_<_16rem)]:size-[44px] [@container_(width_<_16rem)]:[&_svg]:size-[24px]',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: 'size-11 rounded-field bg-muted text-foreground [&_svg]:size-6',
        image: 'size-11 rounded-field overflow-hidden bg-muted [&_img]:absolute [&_img]:inset-0 [&_img]:size-full [&_img]:object-cover',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function ItemMedia({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof itemMediaVariants>) {
  return <span data-slot="item-media" data-variant={variant ?? 'default'} className={cn(itemMediaVariants({ variant }), className)} {...props} />
}

function ItemContent({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="item-content" className={cn('grid grid-cols-[minmax(0,1fr)] flex-1 min-w-0 gap-0.5', className)} {...props} />
}

function ItemTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="item-title" className={cn('font-semibold leading-[1.3] text-[length:var(--step-1)] text-pretty [overflow-wrap:anywhere]', className)} {...props} />
}

function ItemDescription({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="item-description" className={cn('text-muted-foreground leading-[1.45] text-[length:var(--step--1)] text-pretty [overflow-wrap:anywhere]', className)} {...props} />
}

function ItemActions({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="item-actions" className={cn('flex flex-none items-center gap-2', className)} {...props} />
}

export { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions, ItemGroup, ItemSeparator, itemVariants }
