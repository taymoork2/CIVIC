import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/closet/closet-parts'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const tagChipClassName = 'min-w-0 max-w-full whitespace-normal py-2.5 text-start [overflow-wrap:anywhere]'

/** Shared chip editing; each caller keeps its own vocabulary and validation. */
export function TagEditor({ values, knownValues = [], suggestions = [], onChange, words, rules, compact = false, hideLabel = false, inputValue, onInputChange, hint }: {
  values: readonly string[]; knownValues?: readonly string[]; suggestions?: readonly string[]
  onChange: (values: string[]) => void
  words: { label: string; placeholder: string; add: string; more?: string }
  rules: { maxCount: number; maxLength: number; normalize: (values: readonly string[]) => string[] }
  compact?: boolean; hideLabel?: boolean; inputValue?: string; onInputChange?: (value: string) => void; hint?: string
}) {
  const id = useId()
  const [localName, setLocalName] = useState('')
  const name = inputValue ?? localName
  const [error, setError] = useState<string | null>(null)
  const chosen = new Set(values.map((value) => value.toLowerCase()))
  const query = name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
  const all = [...new Map([...knownValues, ...values, ...suggestions].map((tag) => [tag.toLowerCase(), tag])).values()]
  const familiar = new Set([...values, ...(knownValues.length === 0 ? suggestions.slice(0, 5) : knownValues)].map((tag) => tag.toLowerCase()))
  const options = query ? all.filter((tag) => tag.toLowerCase().includes(query)) : compact ? all.filter((tag) => familiar.has(tag.toLowerCase())) : all
  const more = compact && !query ? all.filter((tag) => !familiar.has(tag.toLowerCase())) : []
  const changeName = (value: string) => { setLocalName(value); onInputChange?.(value) }
  const add = (tag: string) => {
    try {
      const entered = rules.normalize([tag])[0]!
      const normalized = all.find((option) => option.toLowerCase() === entered.toLowerCase()) ?? entered
      if (!chosen.has(normalized.toLowerCase())) onChange(rules.normalize([...values, normalized]))
      changeName('')
      setError(null)
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to add this entry.') }
  }
  const toggle = (tag: string) => {
    if (chosen.has(tag.toLowerCase())) { onChange(values.filter((value) => value.toLowerCase() !== tag.toLowerCase())); setError(null) }
    else add(tag)
  }
  return <div className="grid min-w-0 gap-2">
    <Field className="grid gap-2">
      <FieldLabel htmlFor={id} className={hideLabel ? 'sr-only' : 'text-[length:var(--step-1)] font-semibold'}>{words.label}</FieldLabel>
      <div className="flex min-w-0 items-start gap-2">
        <Input id={id} className="min-w-0 flex-1" value={name} maxLength={rules.maxLength} placeholder={words.placeholder} aria-invalid={error !== null} aria-describedby={[hint ? `${id}-hint` : null, error !== null ? `${id}-error` : null].filter(Boolean).join(' ') || undefined} onChange={(event) => { changeName(event.target.value); setError(null) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (name.trim()) add(name) } }} />
        {!query ? null : <Button type="button" variant="outline" disabled={values.length >= rules.maxCount && !chosen.has(query)} onClick={() => add(name)}>{words.add}</Button>}
      </div>
      {error === null ? null : <p id={`${id}-error`} role="alert" className="m-0 text-[length:var(--step--1)] font-semibold text-conflict-ink">{error}</p>}
      {hint ? <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription> : null}
    </Field>
    <div role="group" aria-label={words.label} className="flex min-w-0 flex-wrap gap-2">{options.map((tag) => <Chip key={tag} className={tagChipClassName} pressed={chosen.has(tag.toLowerCase())} disabled={!chosen.has(tag.toLowerCase()) && values.length >= rules.maxCount} onClick={() => toggle(tag)}>{tag}</Chip>)}</div>
    {more.length === 0 ? null : <details className="grid min-w-0 gap-2"><summary className="min-h-11 cursor-pointer rounded-control px-3 py-3 font-semibold hover:bg-surface-2 active:bg-surface-2">{words.more}</summary><div role="group" aria-label={`Suggested ${words.label.toLowerCase()}`} className="flex min-w-0 flex-wrap gap-2">{more.map((tag) => <Chip key={tag} className={tagChipClassName} pressed={chosen.has(tag.toLowerCase())} disabled={values.length >= rules.maxCount} onClick={() => toggle(tag)}>{tag}</Chip>)}</div></details>}
  </div>
}
