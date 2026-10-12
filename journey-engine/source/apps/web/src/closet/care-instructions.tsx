import { useId, useState } from 'react'
import type { FunctionArgs } from 'convex/server'
import { careRequirementProblem, washRequirementKinds, dryRequirementKinds, mechanicalSeverities, type MechanicalSeverity } from '@washcloset/planner'
import { api } from '@/api'
import { Sheet } from '@/kit/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { ErrorNotice, useConvexCall } from '@/kit/ui'
import type { Textile } from '@/household/inventory-types'

type Instructions = NonNullable<FunctionArgs<typeof api.inventory.setCareInstructions>['instructions']>
type Requirement = NonNullable<Instructions['washingRequirements']>[number]['requirements'][number]
const categories = [
  ['preparation', 'Before washing', 'Handling only: turn inside out, use a bag, close fasteners or remove trim.'],
  ['washing', 'Additional wash settings or product requirements', 'For example: reduced load, extra rinse, short spin or a detergent restriction. These require review before this piece can be planned.'],
  ['beforeDrying', 'Before drying', 'Preparation only: reshape while damp or smooth the garment.'],
  ['drying', 'Additional dryer or drying settings', 'Keep method, position, environment and process requirements here, including drip-flat, shade or away from heat. These require review before starting drying.'],
  ['afterDrying', 'When checking or removing it', 'For example: remove promptly or smooth before folding.'],
  ['ironing', 'Ironing and protected surfaces', 'Keep conditions such as reverse side, damp ironing, press cloth or no ironing on decoration.'],
] as const
const empty: Instructions = { source: '', preparation: [], washing: [], beforeDrying: [], drying: [], afterDrying: [], ironing: [] }

const requirementWords: Record<Requirement['kind'], string> = {
  wash_alone_first_wash: 'Wash alone for the first wash only',
  wash_alone: 'Wash alone every time', wash_with_like_colors: 'Wash with like colors',
  maximum_mechanical_severity: 'Maximum mechanical severity',
  maximum_wash_minutes: 'Maximum washing-phase duration (minutes)',
  detergent_fragrance_free: 'Use fragrance-free detergent', detergent_dye_free: 'Use dye-free detergent', detergent_bleach_free: 'Use detergent without bleach',
  maximum_fill_fraction: 'Maximum drum fill (fraction, for example 0.5)', extra_rinses: 'Minimum additional rinses',
  maximum_rinse_temperature: 'Maximum rinse temperature (°C)', maximum_spin_rpm: 'Maximum spin speed (rpm)', maximum_spin_minutes: 'Maximum spin time (minutes)',
  no_spin: 'No spin in any phase', no_softener: 'No fabric softener or dryer sheets', no_dryer_sheets: 'No dryer sheets', no_bleach: 'No bleach',
  dry_flat: 'Dry flat only', line_dry: 'Hang to dry only', drip_dry: 'Drip dry without extraction or wringing', shade: 'Dry in shade', no_direct_heat: 'Dry away from direct heat',
}
const numericKinds: readonly Requirement['kind'][] = ['maximum_wash_minutes', 'maximum_fill_fraction', 'extra_rinses', 'maximum_rinse_temperature', 'maximum_spin_rpm', 'maximum_spin_minutes']

/** The person reading this source interprets every condition; the app never recognizes prose. */
export function ProcessRequirements({ stage, lines, value, onChange }: { stage: 'washing' | 'drying'; lines: readonly string[]; value: NonNullable<Instructions['washingRequirements']>; onChange: (value: NonNullable<Instructions['washingRequirements']>) => void }) {
  const id = useId()
  const allowed = stage === 'washing' ? washRequirementKinds : dryRequirementKinds
  return <div className="grid min-w-0 gap-3">
    <p className="m-0 text-ink-2">Confirm every condition in the label’s wording. Leave unclear or conflicting lines unresolved; they still block the process.</p>
    {stage === 'washing' && value.some((line) => line.requirements.some((requirement) => requirement.kind === 'wash_alone_first_wash')) ? <p className="m-0 text-ink-2">Unwashed pieces wash alone. Recorded wash history ends first-wash separation; other label requirements still apply. Unknown history needs confirmation.</p> : null}
    {lines.map((wording, index) => {
      const binding = value.find((entry) => entry.wording === wording)
      const set = (requirements: NonNullable<Instructions['washingRequirements']>[number]['requirements'], checked = false) => onChange([...value.filter((entry) => entry.wording !== wording), ...(requirements.length === 0 ? [] : [{ wording, requirements, checked }])])
      return <fieldset key={wording} className="m-0 grid min-w-0 gap-3 rounded-control border border-line p-3">
        <legend className="break-words">{wording}</legend>
        {binding?.requirements.map((requirement, position) => <div key={position} className="grid min-w-0 gap-2">
          {requirement.kind === 'maximum_mechanical_severity' ? <Field><FieldLabel htmlFor={`${id}-${index}-${position}`}>{requirementWords[requirement.kind]}</FieldLabel><NativeSelect id={`${id}-${index}-${position}`} value={requirement.value} onChange={(event) => set(binding.requirements.map((entry, at) => at === position ? { ...requirement, value: event.target.value as MechanicalSeverity } : entry))}><option value="">Not recorded or unclear</option>{mechanicalSeverities.map((severity) => <option key={severity} value={severity}>{severity === 'very_mild' ? 'Very mild' : severity === 'mild' ? 'Mild' : 'Normal'}</option>)}</NativeSelect><FieldDescription>A program name does not establish severity. Exact fill, rinse, spin and time conditions must also be recorded when required.</FieldDescription></Field> : 'value' in requirement ? <Field><FieldLabel htmlFor={`${id}-${index}-${position}`}>{requirementWords[requirement.kind]}</FieldLabel><Input id={`${id}-${index}-${position}`} type="number" min={0} max={requirement.kind === 'maximum_wash_minutes' ? 300 : undefined} step="any" value={requirement.value} onChange={(event) => set(binding.requirements.map((entry, at) => at === position ? { ...requirement, value: Number(event.target.value) } : entry))} />{requirement.kind === 'maximum_wash_minutes' ? <FieldDescription>Copy the exact washing-phase maximum, above 0 and at most 300 minutes. Soaking, rinsing, spinning and total-cycle timers are separate. The chosen machine’s documented phase duration must be checked separately.</FieldDescription> : null}</Field> : <p className="m-0">{requirementWords[requirement.kind]}</p>}
          <Button type="button" variant="outline" className="justify-self-start" onClick={() => set(binding.requirements.filter((_, at) => at !== position))}>Remove condition</Button>
        </div>)}
        <Field><FieldLabel htmlFor={`${id}-${index}-add`}>Add a supported condition</FieldLabel><NativeSelect id={`${id}-${index}-add`} value="" onChange={(event) => {
          const kind = event.target.value as Requirement['kind']
          if (!kind) return
          const requirement = kind === 'maximum_mechanical_severity' ? { kind, value: '' } : numericKinds.includes(kind) ? { kind, value: 0 } : { kind }
          set([...(binding?.requirements ?? []), requirement as Requirement])
        }}><option value="">Keep unresolved / choose condition</option>{allowed.filter((kind) => !binding?.requirements.some((entry) => entry.kind === kind)).map((kind) => <option key={kind} value={kind}>{requirementWords[kind]}</option>)}</NativeSelect></Field>
        {binding === undefined ? null : <label className="flex min-h-11 items-center gap-3"><Checkbox checked={binding.checked} onCheckedChange={(checked) => set(binding.requirements, checked === true)} /><span>I’ve checked that these conditions cover this entire source line</span></label>}
      </fieldset>
    })}
  </div>
}

/** One physical piece; matching names never imply a shared instruction. */
/** A piece's recorded label notes and, when asked, the sheet to add more; the care list holds the row that asks. */
export function CareInstructions({ textile, pieceLabel, open, onClose }: { textile: Textile; pieceLabel?: string; open: boolean; onClose: () => void }) {
  const instructions = textile.care?.instructions
  return <div className="grid min-w-0 gap-2">
    {pieceLabel === undefined ? null : <p className="m-0">{pieceLabel}</p>}
    {instructions === undefined ? null : <div className="grid gap-2 text-[length:var(--step--1)] break-words">
      {categories.filter(([key]) => instructions[key].length > 0).map(([key, title]) => <div key={key}><p className="m-0 font-semibold">{title}</p><ul className="m-0 ps-5">{instructions[key].map((wording) => <li key={wording}>{wording}</li>)}</ul></div>)}
      {instructions.maximumSoakMinutes === undefined ? null : <p className="m-0">{instructions.maximumSoakMinutes === 0 ? 'Do not soak' : `Maximum soaking time: ${instructions.maximumSoakMinutes} min`}</p>}
      {(['professionalDry', 'professionalWet'] as const).map((key) => instructions[key] === undefined ? null : <p key={key} className="m-0">{key === 'professionalDry' ? 'Professional dry cleaning' : 'Professional wet cleaning'}: {instructions[key].permission === 'allowed' ? 'allowed' : instructions[key].permission === 'not_allowed' ? 'not allowed' : 'permission unknown'} · {instructions[key].wording}</p>)}
      <p className="m-0 text-ink-2">Source: {instructions.source}{instructions.symbolSystem ? ` · ${instructions.symbolSystem}` : ''}</p>
    </div>}
    {open ? <InstructionsSheet textile={textile} onClose={onClose} /> : null}
  </div>
}

function InstructionsSheet({ textile, onClose }: { textile: Textile; onClose: () => void }) {
  const id = useId()
  const [expectedInstructions] = useState(textile.care?.instructions ?? null)
  const initial = expectedInstructions ?? empty
  const [draft, setDraft] = useState(initial)
  const [lines, setLines] = useState(() => Object.fromEntries(categories.map(([key]) => [key, initial[key].join('\n')])) as Record<(typeof categories)[number][0], string>)
  const [soak, setSoak] = useState(initial.maximumSoakMinutes === undefined ? '' : String(initial.maximumSoakMinutes))
  const [section, setSection] = useState<(typeof categories)[number][0] | 'professional'>('preparation')
  const save = useConvexCall(api.inventory.setCareInstructions)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || categories.some(([key]) => lines[key] !== initial[key].join('\n')) || soak !== (initial.maximumSoakMinutes === undefined ? '' : String(initial.maximumSoakMinutes))
  const processProblem = (['washing', 'drying'] as const).filter((stage) => (draft[`${stage}Requirements`] ?? []).some((binding) => binding.requirements.some((entry) => careRequirementProblem(entry) !== null)))
  const commit = async () => {
    const instructions: Instructions = { ...draft, ...Object.fromEntries(categories.map(([key]) => [key, lines[key].split('\n').map((line) => line.trim()).filter(Boolean)])),
      ...(soak.trim() === '' ? { maximumSoakMinutes: undefined } : { maximumSoakMinutes: Number(soak) }),
    }
    for (const [stage, key] of [['washing', 'washingRequirements'], ['drying', 'dryingRequirements']] as const) {
      if (instructions[key] !== undefined) instructions[key] = instructions[key].filter((binding) => instructions[stage].includes(binding.wording))
    }
    if (await save.run({ textileId: textile.textileId, instructions, expectedInstructions }) !== undefined) onClose()
  }
  return <Sheet title="Label notes" kicker={textile.name} onClose={onClose} closeAtTop tall dirty={dirty}
    footer={<><ErrorNotice error={save.error} />{processProblem.length === 0 ? null : <p role="status">Check {processProblem.join(' and ')}: enter each exact numeric condition within its supported range.</p>}<Button variant="outline" disabled={save.pending} onClick={onClose}>Cancel</Button><Button disabled={!dirty || !draft.source.trim() || save.pending || processProblem.length > 0} onClick={() => void commit()}>Save label</Button></>}>
    <p className="m-0 text-ink-2">Copy this piece’s label, including conditions and component names. These instructions are required, separate from optional advice or routines.</p>
    <fieldset disabled={save.pending} className="m-0 grid min-w-0 gap-4 border-0 p-0">
    <Field><FieldLabel htmlFor={`${id}-source`}>Where you read it</FieldLabel><Input id={`${id}-source`} value={draft.source} maxLength={240} onChange={(event) => setDraft({ ...draft, source: event.target.value })} placeholder="Sewn label or exact manufacturer reference" /></Field>
    <Field><FieldLabel htmlFor={`${id}-symbols`}>Symbol system or edition, if known</FieldLabel><Input id={`${id}-symbols`} value={draft.symbolSystem ?? ''} maxLength={120} onChange={(event) => setDraft({ ...draft, symbolSystem: event.target.value })} /></Field>
    <Field><FieldLabel htmlFor={`${id}-section`}>Label section</FieldLabel><NativeSelect id={`${id}-section`} value={section} onChange={(event) => setSection(event.target.value as typeof section)}>{categories.map(([key, title]) => <option key={key} value={key}>{title}</option>)}<option value="professional">Professional cleaning</option></NativeSelect></Field>
    {categories.filter(([key]) => key === section).map(([key, title, help]) => <Field key={key}><FieldLabel htmlFor={`${id}-${key}`}>{title}</FieldLabel><Textarea id={`${id}-${key}`} value={lines[key]} onChange={(event) => setLines({ ...lines, [key]: event.target.value })} /><FieldDescription>{help} One instruction per line.</FieldDescription></Field>)}
    {(['washing', 'drying'] as const).filter((stage) => stage === section).map((stage) => {
      const key = stage === 'washing' ? 'washingRequirements' : 'dryingRequirements'
      const wording = [...new Set(lines[stage].split('\n').map((line) => line.trim()).filter(Boolean))]
      return wording.length === 0 ? null : <ProcessRequirements key={stage} stage={stage} lines={wording} value={draft[key] ?? []} onChange={(value) => setDraft({ ...draft, [key]: value })} />
    })}
    {section !== 'washing' ? null : <Field><FieldLabel htmlFor={`${id}-soak`}>Maximum soaking time on this label (minutes)</FieldLabel><Input id={`${id}-soak`} value={soak} type="number" min={0} max={1440} step="any" onChange={(event) => setSoak(event.target.value)} /><FieldDescription>Leave blank when unspecified. Enter 0 for “do not soak”. This limit never supplies a product’s minimum contact time.</FieldDescription></Field>}
    {section !== 'professional' ? null : (['professionalDry', 'professionalWet'] as const).map((key) => <fieldset key={key} className="grid min-w-0 gap-3 rounded-control border border-line p-3"><legend className="font-semibold">{key === 'professionalDry' ? 'Professional dry cleaning' : 'Professional wet cleaning'}</legend>
      <Field><FieldLabel htmlFor={`${id}-${key}-permission`}>Permission on the label</FieldLabel><NativeSelect id={`${id}-${key}-permission`} value={draft[key]?.permission ?? 'unknown'} onChange={(event) => setDraft({ ...draft, [key]: { permission: event.target.value as 'allowed' | 'not_allowed' | 'unknown', wording: draft[key]?.wording ?? '' } })}><option value="unknown">Not recorded or unclear</option><option value="allowed">Allowed</option><option value="not_allowed">Not allowed</option></NativeSelect></Field>
      <Field><FieldLabel htmlFor={`${id}-${key}-wording`}>Solvent, severity or other wording</FieldLabel><Textarea id={`${id}-${key}-wording`} maxLength={500} value={draft[key]?.wording ?? ''} onChange={(event) => setDraft({ ...draft, [key]: event.target.value === '' && (draft[key]?.permission ?? 'unknown') === 'unknown' ? undefined : { permission: draft[key]?.permission ?? 'unknown', wording: event.target.value } })} /><FieldDescription>Specialist instructions do not authorize home solvent use or household washing.</FieldDescription></Field>
    </fieldset>)}
    </fieldset>
  </Sheet>
}
