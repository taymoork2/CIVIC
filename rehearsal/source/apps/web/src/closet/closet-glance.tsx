import { cn } from '@/lib/utils'

import { closetState } from '@/closet/closet-groups'
import { PersonChoices } from '@/closet/closet-parts'
import { closetListText } from '@/copy-closet'
import { DesignIcon, type DesignIconName } from '@/kit/design-icons'
import type { GarmentStatus } from '@/closet/garment-groups'

/**
 * The Closet's glance: where the clothes stand as four compact counts, and whose
 * closet this is as person circles. Tapping a person is the only action.
 */

export type GlanceCounts = { readonly ready: number; readonly laundry: number; readonly hamper: number; readonly care: number }

/** Pieces by where they stand: ready, in the laundry (washing or drying), in the hamper, or needing care. */
export function glanceCounts(garments: readonly { readonly status: GarmentStatus; readonly inLoad: string | null }[]): GlanceCounts {
  const counts = { ready: 0, laundry: 0, hamper: 0, care: 0 }
  for (const garment of garments) {
    const state = closetState(garment)
    if (state === 'ready') counts.ready += 1
    else if (state === 'in_wash' || state === 'hanging') counts.laundry += 1
    else if (state === 'dirty') counts.hamper += 1
    else counts.care += 1
  }
  return counts
}

const countsOrder = ['ready', 'laundry', 'hamper', 'care'] as const satisfies readonly (keyof GlanceCounts)[]
const countSymbols = {
  ready: { icon: 'tee', tone: 'bg-ready-bg text-ready-ink' },
  laundry: { icon: 'washer', tone: 'bg-washing-bg text-washing-ink' },
  hamper: { icon: 'laundry', tone: 'bg-hamper-bg text-hamper-ink' },
  care: { icon: 'spray', tone: 'bg-surface-2 text-ink' },
} as const

export type GlancePerson = { readonly value: string; readonly label: string; readonly mark: string | DesignIconName; readonly icon?: boolean }

export function ClosetGlance({ counts, people, selected, onPerson }: {
  counts: GlanceCounts
  /** Whose closet: shown only when there is more than one to choose from. */
  people: readonly GlancePerson[]
  selected: string
  onPerson: (value: string) => void
}) {
  const text = closetListText.glance
  // Counts stay quiet; the person circles choose which clothes appear below.
  return (
    <div className="grid min-w-0 gap-3">
    <section aria-label={text.label} className="grid min-w-0 [container-type:inline-size]">
      <ul role="list" className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-2 p-0 [@container_(width_>=_16em)]:grid-cols-2 [@container_(width_>=_32em)]:grid-cols-4">
        {countsOrder.map((key) => (
          <li key={key} className="flex min-w-0 items-center gap-2.5">
            <span className={cn('grid size-8 flex-none place-items-center rounded-[10px]', countSymbols[key].tone)} aria-hidden="true"><DesignIcon name={countSymbols[key].icon} size="1.25rem" /></span>
            <span className="flex min-w-0 items-baseline gap-2 leading-tight">
              <span className={cn('font-bold tabular-nums', counts[key] === 0 && 'text-ink-2')}>{counts[key]}</span>
              <span className="text-[length:var(--step--1)] text-ink-2">{text[key]}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
      {people.length === 0 ? null : <PersonChoices label={text.people} value={selected} onPick={onPerson}
        options={people.map((person) => ({ value: person.value, label: person.label, mark: person.icon === true ? <DesignIcon name={person.mark as DesignIconName} size={20} /> : person.mark }))} />}
    </div>
  )
}
