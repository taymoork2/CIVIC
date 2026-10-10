import { useId } from 'react'
import { productCapabilities } from '@washcloset/planner'
import type { FunctionArgs } from 'convex/server'
import type { api } from '@/api'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

type Facts = NonNullable<NonNullable<FunctionArgs<typeof api.inventory.createSupply>['safety']>['capabilities']>
export const capabilityWords = { oxygen_bleaching: 'Oxygen bleaching', optical_brightening: 'Optical brightening', hardness_management: 'Water-hardness management', protease: 'Protease enzyme', lipase: 'Lipase enzyme', amylase: 'Amylase enzyme', soil_dispersal: 'Soil dispersal', fragrance: 'Fragrance' } as const

export function ProductCapabilities({ facts = [], onChange }: { facts?: Facts; onChange: (facts: Facts) => void }) {
  const id = useId()
  const update = (kind: Facts[number]['kind'], patch: Partial<Facts[number]>) => {
    const current = facts.find((fact) => fact.kind === kind)
    onChange([...facts.filter((fact) => fact.kind !== kind), { kind, status: 'present', variant: '', market: '', formulationRevision: '', source: '', retrievedAt: 0, scope: 'ingredient_disclosure', ...current, ...patch }])
  }
  return <div className="grid gap-4">
    <p className="text-sm text-ink-2">Use this exact variant and market. Missing ingredients don’t prove absence. Names and safety data sheets don’t establish doses, recipes or benefits.</p>
    {productCapabilities.map((kind) => {
      const fact = facts.find((entry) => entry.kind === kind)
      const prefix = `${id}-${kind}`
      return <fieldset key={kind} className="grid gap-3"><legend>{capabilityWords[kind]}</legend>
        <Field><FieldLabel htmlFor={`${prefix}-status`}>What the source says about {capabilityWords[kind].toLowerCase()}</FieldLabel><NativeSelect id={`${prefix}-status`} value={fact?.status ?? 'unknown'} onChange={(event) => event.target.value === 'unknown' ? onChange(facts.filter((entry) => entry.kind !== kind)) : update(kind, { status: event.target.value as 'present' | 'absent', scope: event.target.value === 'absent' ? 'explicit_absence' : 'ingredient_disclosure' })}>
          <NativeSelectOption value="unknown">Not established</NativeSelectOption><NativeSelectOption value="present">Explicitly recorded</NativeSelectOption><NativeSelectOption value="absent">Explicitly confirmed absent</NativeSelectOption>
        </NativeSelect></Field>
        {fact === undefined ? null : <>
          <Field><FieldLabel htmlFor={`${prefix}-variant`}>Exact variant and pack code</FieldLabel><Input id={`${prefix}-variant`} value={fact.variant} maxLength={200} onChange={(event) => update(kind, { variant: event.target.value })} /></Field>
          <Field><FieldLabel htmlFor={`${prefix}-market`}>Market</FieldLabel><Input id={`${prefix}-market`} value={fact.market} maxLength={80} onChange={(event) => update(kind, { market: event.target.value })} /></Field>
          <Field><FieldLabel htmlFor={`${prefix}-revision`}>Pack revision or ingredient-list version</FieldLabel><Input id={`${prefix}-revision`} value={fact.formulationRevision} maxLength={200} onChange={(event) => update(kind, { formulationRevision: event.target.value })} /></Field>
          <Field><FieldLabel htmlFor={`${prefix}-source`}>Pack or manufacturer source</FieldLabel><Input id={`${prefix}-source`} value={fact.source} maxLength={500} onChange={(event) => update(kind, { source: event.target.value })} /></Field>
          <Field><FieldLabel htmlFor={`${prefix}-date`}>Date checked</FieldLabel><Input id={`${prefix}-date`} type="date" value={fact.retrievedAt > 0 ? new Date(fact.retrievedAt).toISOString().slice(0, 10) : ''} onChange={(event) => update(kind, { retrievedAt: event.target.value === '' ? 0 : Date.parse(`${event.target.value}T12:00:00Z`) })} /></Field>
          <Field><FieldLabel htmlFor={`${prefix}-scope`}>What the source establishes</FieldLabel><NativeSelect id={`${prefix}-scope`} value={fact.scope} onChange={(event) => update(kind, { scope: event.target.value as Facts[number]['scope'] })}>
            {fact.status === 'absent' ? <NativeSelectOption value="explicit_absence">Explicit absence statement</NativeSelectOption> : <><NativeSelectOption value="ingredient_disclosure">Named ingredient or mechanism</NativeSelectOption><NativeSelectOption value="manufacturer_claim">Manufacturer claim</NativeSelectOption></>}
          </NativeSelect></Field>
        </>}
      </fieldset>
    })}
  </div>
}
