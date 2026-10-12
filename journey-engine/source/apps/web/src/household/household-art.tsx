import { cn } from '@/lib/utils'
import { draftFromSupply } from '@/products/bottle-sheet'
import type { Machine, Supply } from '@/household/inventory-types'
import { CategoryPhoto } from '@/products/product-ui'
import { DesignIcon } from '@/kit/design-icons'

/** Representative packaging, never verified brand or formulation evidence. */
const objectPhotoClassName = cn(
  "object-photo",
  "[.care-hero-art_&]:rounded-[1rem]",
  "block w-full h-full min-w-0 min-h-0 object-cover rounded-[inherit]",
  "[.household-page_.machine-row-art_&]:[mask-image:linear-gradient(to_bottom,_#000_85%,_transparent)]",
)

const objectFallbackClassName = cn(
  "object-fallback",
  "w-[2.5rem] h-[2.5rem] text-ink-2",
)

export function ProductArt({ supply }: { supply: Supply }) {
  const draft = draftFromSupply(supply)
  // No photo shows a dryer sheet (the detergent-sheets photo is a wash product) or scent beads, so their stroke icons stand in.
  if (supply.kind === 'dryer_sheet' || draft.form === 'sheets' || draft.form === 'beads') return <span className="grid size-full place-items-center bg-muted"><DesignIcon name={draft.form === 'beads' ? 'beads' : 'dryerSheet'} size={40} strokeWidth={1.5} className={objectFallbackClassName} /></span>
  const photo = supply.kind === 'wool_dryer_ball' ? 'wool-balls'
    : supply.kind === 'dispensing_device' ? 'dispensing-ball-v2'
    : draft.form === 'pods' ? 'detergent-pods'
    : draft.form === 'powder' ? 'powder'
    : draft.use === 'sanitizer' || draft.use === 'rinse_sanitizer' ? 'sanitizer'
    : /rinse\s*&\s*refresh/i.test(supply.name) || draft.use === 'softener' ? 'rinse'
    : 'detergent'
  return <CategoryPhoto src={'/design/' + photo + '-photo.webp'} className={objectPhotoClassName} fallback={<DesignIcon name="flask" size="1em" className={objectFallbackClassName} aria-hidden="true"  />} />
}

export function MachineArt({ type }: { type: Machine['applianceType'] }) {
  // No photo stands in for a heated hanging dryer; its icon does, and never suggests a drum.
  if (type === 'heated_hanging_dryer') return <span className="grid size-full place-items-center bg-muted"><DesignIcon name="hang" size="1em" className={objectFallbackClassName} aria-hidden="true"  /></span>
  const photo = type === 'top_load_washer' ? 'top-loader' : type === 'tumble_dryer' ? 'dryer' : 'front-loader'
  return <CategoryPhoto src={'/design/' + photo + '-photo.webp'} className={objectPhotoClassName} fallback={<DesignIcon name="washer" size="1em" className={objectFallbackClassName} aria-hidden="true"  />} />
}
