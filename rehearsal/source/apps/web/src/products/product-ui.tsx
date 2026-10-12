import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useState, type ReactNode } from 'react'
import { DesignIcon, type IconName } from '@/kit/design-icons'

const careHeroClassName = cn(
  "care-hero",
  "relative isolate grid gap-3 min-h-[7.5rem] p-4 rounded-[1rem] bg-surface text-ink overflow-clip shadow-[0_0_0_1px_var(--surface-edge),_var(--shadow-md)]",
  "[&_h1]:m-0 [&_h1]:font-semibold [&_h1]:leading-[1.2]",
  "[&_h1]:text-[length:var(--step-4)]",
  "[&_h1]:font-text",
  "[&_h1]:[overflow-wrap:anywhere]",
  "[&_p]:m-[.6rem_0_0] [&_p]:max-w-[32rem] [&_p]:leading-[1.45] [&_p]:text-ink-2",
  "[&_p]:text-[length:var(--step-0)]",
  "[.closet_&]:grid [.closet_&]:grid-cols-[minmax(0,_1fr)_auto] [.closet_&]:items-center [.closet_&]:gap-3 [.closet_&]:overflow-visible",
  "[.wash_>_&_p]:text-[length:.875rem]",
  "[&.has-photo]:min-h-[22rem] [&.has-photo]:content-end [&.has-photo]:pt-[11rem]",
  "[&.has-photo_img]:w-full [&.has-photo_img]:h-full [&.has-photo_img]:object-cover",
  "[&.has-photo_img]:[object-position:center_30%]",
  "[&.has-photo::after]:[content:'']",
  "[&.has-photo::after]:absolute [&.has-photo::after]:pointer-events-none",
  "[&.has-photo::after]:[inset:0]",
  "[&.has-photo::after]:[z-index:0]",
  "[&.has-photo::after]:[background:linear-gradient(to_bottom,_transparent_24%,_color-mix(in_srgb,_var(--surface)_55%,_transparent)_47%,_var(--surface)_76%)]",
  "[.home-overview_&.has-photo]:min-h-[18rem] [.home-overview_&.has-photo]:pt-[10rem]",
  "[.home-overview_&.has-photo::after]:[background:none]",
  "[.page.wash_>_&]:col-[1_/_-1]",
  "max-[30rem]:[.closet_>_&]:min-h-[9rem]",
  "max-[30rem]:[.wash_>_&]:min-h-[9rem]",
  "[.settings-page_&]:grid-cols-[auto_minmax(0,_1fr)] [.settings-page_&]:items-center",
  "min-[37.5rem]:p-6",
  "min-[37.5rem]:[&.has-photo]:min-h-[24rem] min-[37.5rem]:[&.has-photo]:pt-[13rem]",
  "min-[37.5rem]:[.home-overview_&.has-photo]:pt-[12rem]",
  "lg:[.home-overview_&.has-photo]:min-h-[20rem]",
  "motion-reduce:animate-none",
  "[@media_(forced-colors:_active)]:[border:1px_solid_CanvasText]",
)

const careHeroArtClassName = cn(
  "care-hero-art",
  "absolute w-[5rem] h-[5rem] grid place-items-center",
  "[inset-inline-end:var(--space-4)]",
  "[inset-block-start:var(--space-4)]",
  "[&_svg]:w-full [&_svg]:h-full",
  "[.closet_&]:w-[3rem] [.closet_&]:h-[3rem]",
  "[.care-hero.has-photo_&]:[inset:0]",
  "[.care-hero.has-photo_&]:w-full [.care-hero.has-photo_&]:h-full",
  "[.home-overview_.care-hero.has-photo_&]:h-[10rem]",
  "[.home-overview_.care-hero.has-photo_&]:[mask-image:linear-gradient(to_bottom,_#000_55%,_transparent)]",
  "min-[37.5rem]:[.home-overview_.care-hero.has-photo_&]:h-[12rem]",
)

const careHeroCopyClassName = cn(
  "care-hero-copy",
  "relative pe-[5rem] self-center",
  "[z-index:1]",
  "[.closet_&]:pe-0",
  "[.closet_&_p]:text-[length:.875rem]",
  "[.care-hero.has-photo_&]:pe-0",
  "[.settings-page_&]:col-[2] [.settings-page_&]:row-[1] [.settings-page_&]:p-0",
  "min-[37.5rem]:[.care-hero.has-photo_&]:max-w-[34rem]",
)

const careHeroActionClassName = cn(
  "care-hero-action",
  "relative flex items-center justify-between gap-2",
  "[z-index:2]",
  "[.closet_&]:justify-start [.closet_&]:gap-[.5rem]",
  "[.settings-page_&]:col-[1] [.settings-page_&]:row-[1]",
)

const sectionNavClassName = cn(
  "section-nav",
  "flex items-stretch gap-[.25rem] p-[.25rem] bg-surface-2 rounded-[1rem] min-w-0",
  "[&_button]:flex [&_button]:items-center [&_button]:justify-center [&_button]:flex-1 [&_button]:gap-[.35rem] [&_button]:min-w-0 [&_button]:min-h-[2.75rem] [&_button]:p-[.4rem_.5rem] [&_button]:border-0 [&_button]:rounded-[.75rem] [&_button]:bg-transparent [&_button]:text-ink-2 [&_button]:font-semibold [&_button]:leading-[1.25] [&_button]:font-text [&_button]:cursor-[pointer]",
  "[&_button]:text-[length:var(--step--1)]",
  "[&_button]:[transition:background-color_160ms_var(--ease-out),_color_160ms_var(--ease-out),_transform_120ms_var(--ease-out)]",
  "[&_button[aria-pressed='true']]:text-ink [&_button[aria-pressed='true']]:bg-surface [&_button[aria-pressed='true']]:shadow-[var(--shadow-sm)]",
  "[&_button:active]:[transform:scale(.97)]",
  "[&_button_>_span]:tabular-nums [&_button_>_span]:text-ink-2",
  "[&_button:focus-visible]:[outline:3px_solid_var(--focus)]",
  "[&_button:focus-visible]:[outline-offset:2px]",
  "[.page.wash:not(.wash-pass)_>_&]:col-[1_/_-1]",
  "[:root[data-material='tonal']_&]:rounded-[1.5rem]",
  "[:root[data-material='tonal']_&_button]:rounded-[1.25rem]",
  "[:root[data-material='tonal']_&_button[aria-pressed='true']]:[background:var(--accent-container)]",
  "[:root[data-material='tonal']_&_button[aria-pressed='true']]:[color:var(--on-accent-container)]",
  "[:root[data-material='tonal']_&_button[aria-pressed='true']]:shadow-none",
  "lg:[.page.wash:not(.wash-pass)_>_&]:row-[2]",
  "motion-reduce:[&_button]:transition-none",
  "motion-reduce:[&_button:active]:transform-none",
  "[@media_(forced-colors:_active)]:[&_button[aria-pressed='true']]:[outline:2px_solid_Highlight]",
)

export function CareEmpty({ icon, art, title, description, children }: { icon: IconName; art?: ReactNode; title: string; description?: string; children?: ReactNode }) {
  return <Empty className={art === undefined ? 'rounded-[1rem] border border-solid border-border bg-surface py-8 sm:py-10' : 'rounded-card border-0 bg-surface py-6 shadow-[var(--e1)] sm:py-8'}>
    <EmptyHeader>{art === undefined ? <EmptyMedia variant="icon" className="size-12 rounded-field"><DesignIcon name={icon} className="size-6" /></EmptyMedia> : <div aria-hidden="true" className="mx-auto w-full max-w-[14rem] [&_img]:[mask-image:linear-gradient(to_bottom,_#000_65%,_transparent_100%)]">{art}</div>}<EmptyTitle><h2 className="m-0 text-[length:var(--step-2)] font-semibold">{title}</h2></EmptyTitle>{description ? <EmptyDescription>{description}</EmptyDescription> : null}</EmptyHeader>
    {children ? <EmptyContent>{children}</EmptyContent> : null}
  </Empty>
}

export const headingMetaClassName = cn('inline-flex w-fit flex-wrap items-center rounded-md bg-muted px-2 py-1 text-xs leading-normal text-muted-foreground tabular-nums')

// Blend only image pixels into their containing surface; icons remain crisp.
export const photoBlendClassName = '[mask-image:linear-gradient(to_bottom,_#000_65%,_transparent_100%)]'

/** Local category imagery; failure leaves the surrounding item control usable. */
export function CategoryPhoto({ src, fallback, className, loading = 'lazy' }: { src: string; fallback: ReactNode; className?: string; loading?: 'lazy' | 'eager' }) {
  const [failedSource, setFailedSource] = useState<string>()
  return failedSource === src ? fallback : <img className={className} src={src} alt="" loading={loading} decoding={loading === 'eager' ? 'sync' : 'async'} width={1536} height={1024} onError={() => setFailedSource(src)} />
}

// Shared page-title role: 1.875rem at 600, the same as Home's "Today".
export const pageHeadingClassName = cn('m-0 font-text text-[length:var(--step-4)] font-semibold leading-[1.2] [overflow-wrap:anywhere]')

/** Root feature panels share composition; task pages can keep compact orientation. */
export function CareHero({ title, detail, art, action, photo = false, variant = 'page' }: {
  title: string
  detail?: ReactNode
  art?: ReactNode
  action?: ReactNode
  photo?: boolean
  variant?: 'page' | 'home' | 'feature'
}) {
  if (variant === 'feature') return <header className="care-feature grid min-w-0 gap-4 rounded-card bg-surface p-4 text-ink shadow-[var(--e1)] [container-type:inline-size] sm:p-5">
    <div className={cn('relative isolate flex min-w-0 flex-wrap items-center justify-between gap-3', photo && 'min-h-[128px] items-end [@container_(width_<_12rem)]:min-h-0')}>
      {photo && art !== undefined ? <div aria-hidden="true" className="pointer-events-none absolute -inset-x-4 -top-4 bottom-0 -z-10 overflow-hidden [&_img]:size-full [&_img]:object-cover [&_img]:[object-position:center_50%] [&_img]:[mask-image:linear-gradient(to_bottom,_#000_25%,_transparent_94%)] sm:-inset-x-5 sm:-top-5 [@container_(width_<_12rem)]:hidden">{art}</div> : null}
      <h1 className={cn(pageHeadingClassName, 'flex-1 basis-[8rem]')}>{title}</h1>
      {photo ? action : art === undefined ? null : <div aria-hidden="true" className="w-[8rem] max-w-[40%] flex-none [&_img]:h-24 [&_img]:w-full [&_img]:object-contain [&_img]:[mask-image:linear-gradient(to_bottom,_#000_65%,_transparent_100%)]">{art}</div>}
    </div>
    {detail === undefined ? null : <div className="grid min-w-0 gap-3 text-[length:var(--step--1)] text-ink-2 [overflow-wrap:anywhere]">{detail}</div>}
    {action === undefined || photo ? null : <div className="flex min-w-0 flex-wrap items-center gap-2 [&_>_*]:max-w-full">{action}</div>}
  </header>
  if (variant === 'page') return <header className={cn('page-header relative grid min-w-0 gap-2 [.page.wash_>_&]:col-span-full', art !== undefined && 'grid-cols-[minmax(0,1fr)_5rem] items-center')}>
    {art === undefined ? null : <div aria-hidden="true" className="col-start-2 row-span-2 row-start-1 [&_img]:[mask-image:linear-gradient(to_bottom,_#000_65%,_transparent_100%)]">{art}</div>}
    <h1 className={cn(pageHeadingClassName, action === undefined ? '' : 'pe-14')}>{title}</h1>
    {detail ? <div className={headingMetaClassName}>{detail}</div> : null}
    {action === undefined ? null : <div className="absolute -top-1.5 end-0 flex items-center gap-2">{action}</div>}
  </header>
  return <header className={cn(careHeroClassName, photo ? ' has-photo' : '')}>
    {art === undefined ? null : <div className={careHeroArtClassName} aria-hidden="true">{art}</div>}
    <div className={careHeroCopyClassName}><h1>{title}</h1>{detail ? <p>{detail}</p> : null}</div>
    {action === undefined ? null : <div className={careHeroActionClassName}>{action}</div>}
  </header>
}

/** Arrow keys move between filters; selecting the active filter leaves it selected. */
export function SectionNav<Value extends string>({ label, value, items, onChange }: {
  label: string
  value: Value
  items: readonly { value: Value; label: string; count?: number }[]
  onChange: (value: Value) => void
}) {
  return <ToggleGroup value={[value]} onValueChange={([next]) => { if (next) onChange(next as Value) }} className={sectionNavClassName} aria-label={label}>
    {items.map((item) => <ToggleGroupItem key={item.value} value={item.value}>
      {item.label}{item.count === undefined ? null : <span>{item.count}</span>}
    </ToggleGroupItem>)}
  </ToggleGroup>
}
