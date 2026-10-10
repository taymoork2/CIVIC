import { cn } from '@/lib/utils'
import type { FunctionArgs } from 'convex/server'
import { useState } from 'react'

import type { api } from '@/api'
import type { Care } from '@/household/inventory-types'
import { tagText } from '@/copy'
import { TagRows, asksWashing, bleachWords, dryerWords, tagRowsAnswers, tubWords, type DryerAnswer, type TagQuestion, type IronAnswer, type NaturalDrying, type TagRowsPatch, type TagRowsValue, type TubAnswer, type TubBars, type TubDots } from '@/closet/tag-rows'

/** What `answerTagQuestions` stores for one garment's tag: its arguments minus the garments. */
const tagStepClassName = cn(
  "tag-step",
  "grid gap-4",
)

export type TagAnswers = Omit<FunctionArgs<typeof api.inventory.answerTagQuestions>, 'textileIds'>

/**
 * The crossed tub prohibits washing. Explicit dry-clean-only records stay distinct when edited.
 */
export type TagMethod = 'machine' | 'hand_wash' | 'do_not_wash' | 'dry_clean_only' | 'no_tag'
/** The bleach triangle as tapped: plain, two diagonal lines, crossed out, or "Tag doesn't say" (left out when stored). */
export type TagBleach = NonNullable<TagAnswers['bleach']> | 'unknown'

/**
 * The tag as tapped, in the same rows as bulk add (tag-rows.tsx). Nothing about care is preset: the
 * washtub, and for a washable garment the bleach triangle and dryer square, must be tapped; the
 * iron is optional. "Tag doesn't say" is stored as unknown and fails closed.
 */
export type TagDraft = {
  /** Null until the washtub is tapped. */
  readonly method: TagMethod | null
  readonly dots: TubDots
  readonly bars: TubBars
  readonly maxTemperatureC?: number
  readonly washWithLikeColors?: boolean
  readonly bleach: TagBleach | null
  readonly dryer: DryerAnswer | null
  readonly natural: NaturalDrying | null
  readonly iron: IronAnswer | 'allowed'
  readonly steamPermission?: 'allowed' | 'not_allowed' | 'unknown'
}

export const emptyTag: TagDraft = { method: null, dots: 0, bars: 0, bleach: null, dryer: null, natural: null, iron: 'unknown' }

const methodTubs: Readonly<Record<TagMethod, TubAnswer>> = { machine: 'machine', hand_wash: 'hand_wash', do_not_wash: 'do_not_wash', dry_clean_only: 'dry_clean_only', no_tag: 'unknown' }
const tubMethods: Readonly<Record<TubAnswer, TagMethod>> = { machine: 'machine', hand_wash: 'hand_wash', do_not_wash: 'do_not_wash', dry_clean_only: 'dry_clean_only', unknown: 'no_tag' }

/** The draft as the shared rows read it. */
export function tagRows(tag: TagDraft): TagRowsValue {
  const { method, ...rest } = tag
  return { ...rest, wash: method === null ? null : methodTubs[method] }
}

/**
 * The tag as stored care, the same as bulk add stores it. Answers the tag doesn't give are left
 * out, so they stay unknown and fail closed. Null until the step is complete.
 */
export function tagAnswers(tag: TagDraft): TagAnswers | null {
  return tagRowsAnswers(tagRows(tag))
}

/** Whether the tag step can go on: the washtub, and for a washable garment the bleach triangle and dryer square. */
export function tagComplete(tag: TagDraft): boolean {
  return tagAnswers(tag) !== null
}

/** The tag's answer in a few words, echoed on the button that saves it: "Cold · Low heat". */
export function tagEcho(tag: TagDraft): string | null {
  if (!tagComplete(tag)) return null
  const tub = tubWords(tagRows(tag))
  return !asksWashing(tagRows(tag).wash) || tag.dryer === null || tag.dryer === 'unknown' ? tub : `${tub} · ${dryerWords[tag.dryer]}`
}

/**
 * Recorded care as the tag step's answers, for editing. Anything the rows cannot show reads as
 * unanswered (the washtub is asked again) or "Tag doesn't say"; unchanged answers are not written
 * back, and an iron recorded without its dots is stored again as it was.
 */
export function tagDraftFromCare(care: Pick<Care, 'washMethod' | 'cycle' | 'maxTemperatureC' | 'dryMethod' | 'dryHeat' | 'ironSteam'> & Pick<Care, 'ironHeat' | 'steamPermission'> & { readonly bleach?: TagBleach | null; readonly restrictions?: readonly string[] } | null): TagDraft {
  if (care === null) return emptyTag
  const bars: TubBars | null = care.cycle === 'normal' ? 0 : care.cycle === 'permanent_press' ? 1 : care.cycle === 'delicate' ? 2 : null
  // A machine wash whose cycle the tub can't show is asked again, like an unknown way to wash.
  const method: TagMethod | null = care.washMethod === 'machine' ? (bars === null ? null : 'machine')
    : care.washMethod === 'hand_wash' || care.washMethod === 'dry_clean_only' || care.washMethod === 'do_not_wash' ? care.washMethod
    : care.washMethod === 'unknown' ? 'no_tag'
    : null
  const temperature = care.maxTemperatureC
  const dots: TubDots = method !== 'machine' ? 0 : temperature === 30 ? 1 : temperature === 40 ? 2 : temperature === 50 ? 3 : temperature === 60 ? 4 : 0
  const numericLimit = temperature !== null && (method === 'hand_wash' || (method === 'machine' && dots === 0)) ? temperature : undefined
  // With the washtub unanswered, nothing else unrecorded reads as answered.
  const unrecorded = method === null ? null : 'unknown'
  const dryer: DryerAnswer | null = care.dryMethod === 'tumble_dry' ? (care.dryHeat === 'low' || care.dryHeat === 'medium' || care.dryHeat === 'high' || care.dryHeat === 'no_heat' ? care.dryHeat : 'tumble')
    : care.dryMethod === 'line_dry' || care.dryMethod === 'dry_flat' || care.dryMethod === 'drip_dry' || care.dryMethod === 'do_not_tumble_dry' ? 'no_tumble'
    : unrecorded
  const natural: NaturalDrying | null = care.dryMethod === 'line_dry' ? 'line' : care.dryMethod === 'dry_flat' ? 'flat' : care.dryMethod === 'drip_dry' ? 'drip' : null
  const iron: TagDraft['iron'] = care.ironSteam === 'not_allowed' ? 'no' : care.ironSteam === 'allowed' ? care.ironHeat ?? 'allowed' : 'unknown'
  return { method, dots, bars: method === 'machine' ? bars ?? 0 : 0, bleach: care.bleach ?? unrecorded, dryer, natural, iron,
    ...(care.restrictions?.includes('Wash with like colors') ? { washWithLikeColors: true } : {}),
    ...(numericLimit === undefined ? {} : { maxTemperatureC: numericLimit }),
    ...(care.steamPermission === undefined ? {} : { steamPermission: care.steamPermission }) }
}

/**
 * "Check the tag inside": the tag's symbols, tapped as printed, in the same rows and words as bulk
 * add. Shared by Add clothes, the unknown-care card and Wash now's quick-add.
 */
export function TagStep({ value, onChange, material, only }: { value: TagDraft; onChange: (next: TagDraft) => void; material?: string | null; only?: TagQuestion }) {
  const change = ({ wash, ...rest }: TagRowsPatch) =>
    onChange({ ...value, ...rest, ...(wash === undefined ? {} : { method: wash === null ? null : tubMethods[wash] }) })
  return (
    <div className={tagStepClassName}>
      <TagRows material={material} value={tagRows(value)} onChange={change} only={only} />
    </div>
  )
}

const questionOrder: readonly TagQuestion[] = ['wash', 'bleach', 'dryer']

/** The first question still unanswered, in the order printed on a tag; null when every one that applies is answered. */
export function nextTagQuestion(value: TagDraft): TagQuestion | null {
  const rows = tagRows(value)
  if (rows.wash === null) return 'wash'
  if (!asksWashing(rows.wash)) return null
  if (rows.bleach === null) return 'bleach'
  if (rows.dryer === null) return 'dryer'
  return null
}

/**
 * The tag one question at a time, as in the garment record: each symbol is a row showing its answer;
 * the open question sits below, and answering moves to the next one still unanswered. "Tag doesn't
 * say" is an answer and stays unknown; nothing is filled in from the garment's name.
 */
export function TagQuestions({ value, onChange }: { value: TagDraft; onChange: (next: TagDraft) => void }) {
  const [open, setOpen] = useState<TagQuestion | null>(() => nextTagQuestion(value))
  const rows = tagRows(value)
  const change = ({ wash, ...rest }: TagRowsPatch) => {
    const next = { ...value, ...rest, ...(wash === undefined ? {} : { method: wash === null ? null : tubMethods[wash] }) }
    onChange(next)
    // A dryer square crossed out still asks how it dries instead before moving on.
    if (open === 'dryer' && rest.dryer === 'no_tumble') return
    if (open !== 'more' && rest.washWithLikeColors === undefined) setOpen(nextTagQuestion(next))
  }
  const answer = (question: TagQuestion): string | null => {
    if (question === 'wash') return rows.wash === null ? null : tubWords(rows) ?? tagText.notOnTag
    if (question === 'bleach') return rows.bleach === null ? null : bleachWords[rows.bleach]
    if (question === 'dryer') return rows.dryer === null ? null : dryerWords[rows.dryer]
    return null
  }
  const labels: Record<TagQuestion, string> = { wash: tagText.washtub, bleach: tagText.bleach, dryer: tagText.dryerSquare, more: tagText.moreOnTag }
  const asked = questionOrder.filter((question) => question === 'wash' || asksWashing(rows.wash))
  return (
    <div className={tagStepClassName}>
      <ul className="m-0 grid list-none gap-2 p-0">
        {[...asked, 'more' as const].map((question) => {
          const words = answer(question)
          const current = open === question
          return <li key={question} className="grid gap-2">
            <button type="button" aria-expanded={current} onClick={() => setOpen(current ? null : question)}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-control border-0 bg-surface-2 px-4 py-2 text-start text-inherit cursor-pointer touch-manipulation">
              <span className="grid">
                <span className="font-semibold">{labels[question]}</span>
                <span className="text-muted-foreground text-[length:var(--step--1)]">{question === 'more' ? tagText.optionalGuide : words ?? tagText.notAnswered}</span>
              </span>
              <span className="text-[length:var(--step--1)] font-semibold text-link">{current ? tagText.close : words === null && question !== 'more' ? tagText.answer : tagText.change}</span>
            </button>
            {current ? <TagRows value={rows} onChange={change} only={question} /> : null}
          </li>
        })}
      </ul>
    </div>
  )
}
