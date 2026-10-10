import { cn } from '@/lib/utils'
import { materialCareProblem, clothingTags, usedClothingTags, dyeRunStates, smells, type Smell, garmentKinds, soilLevels, wearerKinds, type DyeRun, type GarmentKind, type Occasion, type SoilLevel, type WearerKind } from '@washcloset/planner'
import { useAction, useMutation, useQuery } from 'convex/react'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useId, useRef, useState, useLayoutEffect, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { CarePhotos, uploadCarePhoto } from '@/closet/care-photos'
import { addClothesText, bulkText, helpTipText, colorWord, careSymbolWords, colourHint, colourWords, kindNameWords, kindTileWords, soilButtonWords, wearerKindWords } from '@/copy'
import { ClothingTagsEditor } from '@/closet/clothing-tags'
import { fabrics, moreFabrics, fabricLabel, fabricProblem, formatFabric, parseFabric, balanceFabric, detailsFromMaterial, detailsForMaterial, type FiberShare } from '@/closet/fabric'
import { fiberDetailSuggestions, fabricConstructions, fabricFinishes, type FabricDetails, type fabricFibers } from '@washcloset/planner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { Textile } from '@/household/inventory-types'
import { addGarmentText, careQuestionText, type CareQuestion } from '@/copy-closet'
import { CareChoices } from '@/closet/garment-care'
import { PersonalRoutine } from '@/closet/personal-routine'
import { articlePlural } from '@/closet/garment-articles'
import { GarmentTypePicker, type TypePick } from '@/closet/garment-type-picker'
import { MoreSection } from '@/kit/more-section'
import { Sheet } from '@/kit/sheet'
import { TaskFooter } from '@/kit/task-footer'
import { TagStep, emptyTag, tagAnswers, tagComplete, tagDraftFromCare, tagRows, type TagDraft } from '@/laundry/tag-step'
import { TagRows, bleachWords, dryerWords, tubWords } from '@/closet/tag-rows'
import { PersonChoices, Swatch } from '@/closet/closet-parts'
import { Stepper, errorMessage, choiceChipVariants } from '@/kit/ui'
import { ActionList, SwitchRow, TrialNote, AnswerRow, SegmentChoice, Ring } from '@/laundry/laundry-ui'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { HelpTip } from '@/kit/help-tip'
import { DesignIcon } from '@/kit/design-icons'
import { CompletionMark } from '@/kit/completion-mark'
import { CareSymbol, type CareSymbolKind } from '@/closet/care-symbols'
import { GarmentIcon } from '@/kit/garment-icon'
import { trialText } from '@/copy-trial'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CatalogReference } from '@/products/catalog-reference'
import { GarmentPrintDetails, factGroups } from '@/closet/garment-advice'
import { GarmentPrivacy } from '@/closet/garment-privacy'
import { CareInstructions } from '@/closet/care-instructions'

/** Add clothes saves them ready; Add to hamper saves them needing a wash. */
const noticeClassName = cn(
  "notice",
  "[.sheet.has-compact-actions_.sheet-foot_>_&]:[flex:1_0_100%]",
  "grid gap-2 p-[var(--space-3)_var(--space-4)] rounded-label",
  "[border:var(--rule-width)_solid_var(--line)]",
  "[background:var(--label)]",
  "text-[length:var(--step-0)]",
)

const badClassName = cn(
  "bad",
  "[.notice&]:[border-color:var(--danger)]",
  "[.notice&]:[color:var(--danger)]",
  "[.notice&]:[background:var(--label)]",
  "[.notice&]:font-semibold",
)

const addClothesFormClassName = cn(
  "add-clothes-form",
  "[&_[data-slot='field-group']]:gap-5",
  "[&_[data-slot='field-label']]:text-ink [&_[data-slot='field-label']]:font-semibold",
  "[&_[data-slot='field-label']]:text-[length:var(--step-1)]",
  "[&_[data-slot='native-select-wrapper']]:w-full",
  "[&_[data-slot='native-select']]:pe-[2.5rem]",
)

const addClothesFieldsClassName = cn(
  "add-clothes-fields",
  "border-0 p-0 m-0 min-w-0",
)

const someoneNewClassName = cn(
  "someone-new",
  "grid gap-3 p-3 rounded-label bg-surface",
)

const fieldClassName = cn(
  "field",
  "grid gap-1",
  "[&_label]:text-[length:var(--step-0)]",
  "[&_label]:font-semibold [&_label]:text-ink-2",
  "[.sheet_&_input:not([type='checkbox']):not([type='radio']):not([type='file'])]:[background-color:var(--sheet)]",
  "[.sheet_&_select]:[background-color:var(--sheet)]",
  "[.sheet_&_textarea]:[background-color:var(--sheet)]",
  "[.sheet_&_:is(input,_select,_textarea):focus-visible]:[border-color:var(--focus)]",
  "[.sheet_&_:is(input,_select,_textarea)]:bg-surface [.sheet_&_:is(input,_select,_textarea)]:rounded-[.75rem]",
)

const largeClassName = cn(
  "large",
  "[.he-logo&]:w-[3rem] [.he-logo&]:h-[3rem]",
  "[.button&]:min-h-[3.5rem] [.button&]:w-full",
  "[.button&]:text-[length:var(--step-1)]",
)

const mutedClassName = cn(
  "muted",
  "text-ink-2",
)

const editClothesFieldsClassName = cn(
  "edit-clothes-fields",
  "grid gap-4",
)

const editClothesExtraClassName = cn(
  "edit-clothes-extra",
  "mt-1",
  "[border-block-start:1px_solid_var(--line)]",
)

const editClothesQuantityClassName = cn(
  "edit-clothes-quantity",
  "[&_input]:max-w-[6rem]",
)

const editCareToggleClassName = cn(
  "edit-care-toggle",
  "flex items-center gap-2 min-h-[2.75rem] cursor-[pointer]",
  "[&_[data-slot=checkbox]]:size-5",
)

const editClothesIdentityClassName = cn(
  "edit-clothes-identity",
  "grid gap-3",
)

const secondaryButtonClassName = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  "[&.danger]:text-destructive",
)

const fileButtonClassName = cn(
  "file-button",
  "relative",
  "[justify-self:start]",
  "[&_input]:absolute [&_input]:opacity-0 [&_input]:cursor-[pointer]",
  "[&_input]:[inset:0]",
  "[&:has(input:focus-visible)]:[outline:3px_solid_var(--focus)]",
  "[&:has(input:focus-visible)]:[outline-offset:2px]",
)

const tagPhotoChosenClassName = cn(
  "tag-photo-chosen",
  "flex items-center gap-2",
)

const colourStepClassName = cn(
  "colour-step",
  "grid gap-3",
)

const colourHintClassName = cn(
  "colour-hint",
  "text-ink-2 leading-[1.35]",
  "text-[length:var(--step-0)]",
)

const visuallyHiddenClassName = cn(
  "visually-hidden",
  "absolute w-[1px] h-[1px] overflow-hidden whitespace-nowrap",
  "[clip-path:inset(50%)]",
)

const addLandedClassName = cn(
  "add-landed",
  "flex flex-wrap items-center gap-3",
)

const addLandedLineClassName = cn(
  "add-landed-line",
  "m-0 min-w-0 flex-[1_1_12rem] font-semibold",
  "text-[length:var(--step-1)]",
)

const carriedCareClassName = cn(
  "carried-care",
  "m-0 p-[var(--space-3)_var(--space-4)] rounded-label bg-surface text-ink-2 leading-[1.35]",
  "text-[length:var(--step-0)]",
)

const saveSummaryClassName = cn(
  "save-summary",
  "m-0 grid gap-[2px] p-[var(--space-3)_var(--space-4)] rounded-label bg-surface",
  "text-[length:var(--step-0)] leading-[1.35]",
)

export type AddTarget = 'closet' | 'hamper'

export type AddStep = 'type' | 'whose' | 'details' | 'fabric' | 'color' | 'origin' | 'dye' | 'care' | 'label' | 'stain' | 'final'
export type IntakeReviewState = { screen: string; draft: AddDraft; dirty: boolean; pending: boolean; error: string | null }
export type IntakePresentation = Record<string, { title?: string; action?: string; color?: string }>
type IntakeStain = NonNullable<FunctionArgs<typeof api.inventory.createTextiles>['stain']>
const intakeStains = ['none', 'food', 'grease', 'ink', 'other'] as const satisfies readonly IntakeStain[]
type StainAge = NonNullable<FunctionArgs<typeof api.inventory.createTextiles>['stainAge']>
const stainAges = ['new', 'set_in'] as const satisfies readonly StainAge[]

/** The first care question still unanswered; a finished label starts again at the washtub. */
function firstCareStep(tag: TagDraft): CareQuestion {
  if (tag.method === null || tag.method === 'dry_clean_only') return 'wash'
  if (tag.bleach === null) return 'bleach'
  if (tag.dryer === null) return 'dry'
  return 'wash'
}
/**
 * One question to a screen: type by its picture, whose, how many, fabric, color, where it is from and (unless
 * pre-owned, whose dye is unknown until a wash) whether the dye could run, the care label, stains, where it goes.
 */
const addSteps: readonly AddStep[] = ['type', 'whose', 'details', 'fabric', 'color', 'origin', 'dye', 'care', 'label', 'stain', 'final']
const stepsFor = (preOwned: boolean): readonly AddStep[] => addSteps.filter((step) => step !== 'label' && (!preOwned || step !== 'dye'))

/** The types offered: a baby bodysuit only when there is a baby. */
export function intakeKinds(wearers: readonly { readonly kind?: WearerKind }[]): readonly GarmentKind[] {
  const baby = wearers.some((wearer) => wearer.kind === 'baby')
  return garmentKinds.filter((kind) => kind !== 'baby_bodysuit' || baby)
}

/** What the sheet does: add new garments, or change the ones a hanger holds. */
export type AddMode =
  /** `whose`: the person the Closet has selected, answered before the sheet opens. */
  | { readonly kind: 'add'; readonly target: AddTarget; readonly whose?: Whose }
  | { readonly kind: 'edit'; readonly textileIds: readonly string[]; readonly careOnly?: 'all' | 'more'; readonly focusField?: EditField }

/** The answer a record row was tapped for: Edit opens with that control focused. */
export type EditField = 'name' | 'whose' | 'kind' | 'color' | 'dyeRun' | 'material' | 'quantity' | 'brand' | 'size' | 'reference'

/** The "What color?" swatches: every colour group but the older "very light". */
export type ColourChoice = keyof typeof colourWords
const colourChoices = Object.keys(colourWords) as ColourChoice[]
const colourQuestion = addClothesText.colorQuestion

/** A wearer, or nobody: towels, sheets and anything shared. */
export type Whose = { readonly wearerId: string } | 'shared'

export type IdentityDraft = {
  readonly brand: string
  readonly size: string
  readonly styleNumber: string
  readonly rnNumber: string
  readonly barcode: string
}

export type AddDraft = {
  readonly whose: Whose | null
  readonly kind: GarmentKind | null
  readonly colour: ColourChoice | null
  readonly colorName: string
  /** New and unwashed, known to bleed, or colorfast; unanswered is left out of the save. */
  readonly dyeRun: DyeRun | null
  /** Thrift or hand-me-down: dye unknown, with optional smell, condition and heat treatment. */
  readonly preOwned?: PreOwnedDraft
  /** Null until answered; No stains is an explicit observation. */
  readonly stain: IntakeStain | null
  /** The main fiber from the label, or null when not recorded; wool and silk change which products are safe. */
  readonly material: string | null
  readonly fabricDetails?: FabricDetails
  readonly additionalColors?: readonly ColorDraft[]
  readonly sameCareInstructions?: boolean
  /** Asked after a stain: new goes to the hamper to treat; old and set in is saved as a known mark. */
  readonly stainAge: StainAge | null
  readonly tag: TagDraft
  readonly count: number
  /** Sent for the hamper or a stain; the sheet preselects Worn for the hamper and Normal for the closet. */
  readonly soil: SoilLevel
  /** Null until typed: a new garment is then named by its color and type at save. */
  readonly name: string | null
  /** The specific article picked by search ("Hoodie"); a plain type tile leaves none. */
  readonly article?: string | null
  /** The name is the words "Add … as Other" put there, not typed in the Name field: another pick clears it. */
  readonly nameFromSearch?: boolean
  /** Legacy explicit occasions, preserved when editing older items. */
  readonly occasions: readonly Occasion[] | null
  readonly tags?: readonly string[]
  readonly identity: IdentityDraft
}

export type ColorDraft = { readonly colour: ColourChoice | null; readonly colorName: string; readonly count: number; readonly dyeRun: DyeRun | null }
export const colorDrafts = (draft: AddDraft): readonly ColorDraft[] => [draft, ...draft.additionalColors ?? []]
export const pieceCount = (draft: AddDraft) => colorDrafts(draft).reduce((total, color) => total + color.count, 0)
const colorsComplete = (draft: AddDraft) => colorDrafts(draft).every((color) => color.colour !== null && Number.isInteger(color.count) && color.count >= 1 && color.count <= 20) && pieceCount(draft) <= 20

export type PreOwnedDraft = { readonly smell: Smell | null; readonly fragile: boolean; readonly heatTreat: boolean }
const emptyPreOwned: PreOwnedDraft = { smell: null, fragile: false, heatTreat: false }

/** Whether the tag allows the dryer's high heat: the high-heat dots, or a tumble-dry square with no limit. */
export const draftAllowsHighHeat = (tag: Pick<TagDraft, 'dryer'>) => tag.dryer === 'high' || tag.dryer === 'tumble'

const noIdentity: IdentityDraft = { brand: '', size: '', styleNumber: '', rnNumber: '', barcode: '' }

export const emptyAddDraft: AddDraft = { whose: null, kind: null, colour: null, colorName: '', dyeRun: 'unknown', stain: null, stainAge: null, material: null, tag: emptyTag, count: 1, soil: 'normal', name: null, occasions: null, identity: noIdentity }

/** "T-shirt" inside a sentence keeps its capital; other words go lower case: "Sam’s pants". */
const inSentence = (word: string) => (/^[A-Z]-/.test(word) ? word : `${word.charAt(0).toLowerCase()}${word.slice(1)}`)

/** A recorded color word as en-US text: the older "Grey" reads "Gray". */
const colorText = (word: string) => colorWord(word.trim())

const draftColor = (draft: Pick<AddDraft, 'colour' | 'colorName'>) =>
  colorText(draft.colorName) || (draft.colour === null || draft.colour === 'unknown' ? '' : colourWords[draft.colour])

/**
 * The name a new garment gets unless one is typed: its color and type, as bulk add names them
 * ("Gray T-shirt", "Navy pants"), or its color and the article picked by search ("Gray hoodie").
 * "Not sure" adds no color word; "Other" has no name to give.
 */
export function derivedName(draft: Pick<AddDraft, 'kind' | 'colour' | 'colorName' | 'article'>): string {
  const word = draft.kind === null ? null : draft.article || kindNameWords[draft.kind]
  if (word === null) return ''
  const colour = draftColor(draft)
  return colour === '' ? word : `${colour} ${inSentence(word)}`
}

/** The typed name, or the derived one while nothing is typed. */
export function garmentName(draft: AddDraft): string {
  return draft.name?.trim() || derivedName(draft)
}

/** The identity fields as typed and trimmed; nothing typed is no identity at all. */
export function identityArg(identity: IdentityDraft): FunctionArgs<typeof api.inventory.createTextiles>['identity'] {
  const typed = Object.entries(identity).map(([key, value]) => [key, value.trim()] as const).filter(([, value]) => value.length > 0)
  return typed.length === 0 ? undefined : Object.fromEntries(typed)
}

const wearerIdOf = (whose: Whose | null) => (whose === null || whose === 'shared' ? null : whose.wearerId)

/** Whether every answer the sheet needs is in, including a name for "Other". */
export function draftComplete(mode: AddMode, draft: AddDraft): boolean {
  return fabricProblem(draft.material) === null && draft.whose !== null && draft.kind !== null && (mode.kind === 'edit' ? draft.colour !== null : colorsComplete(draft)) && tagComplete(draft.tag) && garmentName(draft).length > 0 && (mode.kind === 'edit' || (stainAnswered(draft) && (!draft.additionalColors?.length || draft.sameCareInstructions === true)))
}

/** No stains, or a stain and its age; the age is only ever set after a stain is picked. */
const stainAnswered = (draft: Pick<AddDraft, 'stain' | 'stainAge'>) => draft.stain === 'none' || draft.stainAge !== null

/**
 * The arguments `createTextiles` receives. A specific colour, when supplied, keeps different
 * shades in the same swatch on separate hangers. Occasions are sent only when
 * changed; how dirty only for the hamper. Null until every answer is in.
 */
export function createArgs(householdId: string, target: AddTarget, draft: AddDraft): FunctionArgs<typeof api.inventory.createTextiles> | null {
  const tag = tagAnswers(draft.tag)
  const name = garmentName(draft)
  if (fabricProblem(draft.material) !== null) return null
  if (tag === null || draft.kind === null || draft.colour === null || draft.whose === null || draft.stain === null || !stainAnswered(draft) || name.length === 0 || !colorsComplete(draft) || (draft.additionalColors?.length && draft.sameCareInstructions !== true)) return null
  // A new stain goes to the hamper for treating; an old, set-in one goes where the clothes were going.
  const stained = draft.stainAge === 'new'
  // Dye is unknown until one wash proves it, whatever else was tapped, so a pre-owned piece records no first-wash answer.
  const preOwned = draft.preOwned
  const dyeRun = preOwned === undefined ? draft.dyeRun ?? 'unknown' : 'unknown'
  const firstWash = preOwned !== undefined ? undefined : draft.dyeRun === 'new' ? true : draft.dyeRun === 'fast' ? false : undefined
  const wearerId = wearerIdOf(draft.whose)
  const identity = identityArg(draft.identity)
  return {
    householdId: householdId as Id<'households'>,
    name,
    quantity: pieceCount(draft),
    ...(draft.additionalColors?.length ? { sameCareInstructions: true, colors: colorDrafts(draft).map((color) => ({ name: garmentName({ ...draft, ...color }), color: color.colorName.trim() || colourWords[color.colour!], colorGroup: color.colour!, quantity: color.count, dyeRun: draft.preOwned === undefined ? color.dyeRun ?? 'unknown' : 'unknown' })) } : {}),
    kind: draft.kind,
    ...(wearerId === null ? {} : { wearerId: wearerId as Id<'wearers'> }),
    colorGroup: draft.colour,
    color: draft.colorName.trim() || colourWords[draft.colour],
    ...(firstWash === undefined ? {} : { firstWash }),
    dyeRun,
    ...(preOwned === undefined ? {} : { preOwned: { ...(preOwned.smell === null ? {} : { smell: preOwned.smell }), ...(preOwned.fragile ? { fragile: true } : {}), ...(preOwned.heatTreat && draftAllowsHighHeat(draft.tag) ? { heatTreat: true } : {}) } }),
    ...(draft.occasions === null ? {} : { occasions: [...draft.occasions] }),
    ...(draft.tags === undefined ? {} : { tags: [...draft.tags] }),
    ...(identity === undefined ? {} : { identity }),
    status: target === 'closet' && !stained ? 'clean' : 'dirty',
    ...(target === 'hamper' || stained ? { soilLevel: draft.soil } : {}),
    ...(draft.stainAge === null ? {} : { stain: draft.stain, stainAge: draft.stainAge }),
    ...(draft.material === null ? {} : { material: draft.material }),
    ...(draft.fabricDetails === undefined ? {} : { fabricDetails: draft.fabricDetails }),
    tag,
  }
}

/** What the toast says after saving. */
export function addedToast(target: AddTarget, count: number, name: string): string {
  if (target === 'closet') return addClothesText.saved
  return addClothesText.addedToHamper(name, count)
}

/** What has been added since the sheet opened: pieces by where they went, and how many saves. */
export type AddTally = { readonly closet: number; readonly hamper: number; readonly groups: number }

/** The one toast after Done: a single save keeps its own words; more name the totals. */
export function savedToast(saved: AddSaved, fallback: AddTarget): string {
  const photo = saved.photoFailed ? addClothesText.tagPhotoFailed : ''
  const words = saved.tally === undefined || saved.tally.groups <= 1
    ? addedToast(saved.target ?? fallback, saved.textileIds.length, saved.name)
    : addGarmentText.tallyToast(saved.tally.closet, saved.tally.hamper)
  return `${words}${photo}`
}

/** The saved panel's line: "6 gray tees added to the hamper"; a typed name is used as typed. */
export function landedWords(draft: AddDraft, target: AddTarget): string {
  if (draft.additionalColors?.length) return addGarmentText.landed(`${pieceCount(draft)} pieces`, addGarmentText.landedPlaces[target])
  const typed = draft.name?.trim() ?? ''
  const article = draft.article?.trim() || null
  const counted = article !== null ? [inSentence(article), inSentence(articlePlural(article))] as const : draft.kind === null || draft.kind === 'other' ? null : bulkText.counted[draft.kind]
  const colour = draftColor(draft)
  const thing = typed !== '' || counted === null ? typed : `${colour === '' ? '' : `${colour.toLowerCase()} `}${counted[draft.count === 1 ? 0 : 1]}`
  return addGarmentText.landed(`${draft.count} ${thing}`, addGarmentText.landedPlaces[target])
}

/** "Add another": a new type, so only whose and where it goes carry over; care and the article start blank. */
export function addAnother(saved: AddDraft, target: AddTarget): AddDraft {
  return { ...emptyAddDraft, whose: saved.whose, soil: soilFor(target) }
}

/**
 * "Same again, another color": kind and article, count, whose, the typed name (unless it names the old color),
 * tags and the care answers carry over. The color, its dye run, stains and the item identity belong to one garment and start again.
 */
export function sameAgain(saved: AddDraft): AddDraft {
  const previous = draftColor(saved)
  // "White tee" saved again in black would keep the old color: a typed name naming that color starts again.
  const name = saved.name !== null && previous !== '' && namesColor(saved.name, previous) ? null : saved.name
  return { ...saved, name, colour: null, colorName: '', dyeRun: 'unknown', stain: null, stainAge: null, identity: noIdentity, additionalColors: undefined, sameCareInstructions: undefined }
}

/** The name contains the color as a word, ignoring case; "Grey" and "Gray" are the same word. */
function namesColor(name: string, color: string): boolean {
  const word = colorText(color).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, 'u').test(colorText(name).toLowerCase())
}

/**
 * A type tile or search article picked on the type step. "Add … as Other" also names the garment with the
 * typed words; picking anything else afterwards drops that name, while a name typed in the Name field stays.
 */
export function pickType(draft: AddDraft, pick: TypePick): AddDraft {
  if (pick.typed !== undefined) return { ...draft, kind: pick.kind, article: pick.article, name: pick.typed, nameFromSearch: true }
  return { ...draft, kind: pick.kind, article: pick.article, ...(draft.nameFromSearch === true ? { name: null, nameFromSearch: false } : {}) }
}

type Editable = Pick<Textile, 'textileId' | 'name' | 'kind' | 'wearerId' | 'color' | 'colorGroup' | 'dyeRun' | 'occasions' | 'tags' | 'identity' | 'care' | 'status' | 'inLoad' | 'guest'> & Partial<Pick<Textile, 'private' | 'canChangePrivacy'>>

/** A garment as the sheet's answers, for Edit. */
export function draftFromGarment(garment: Editable): AddDraft {
  const group = garment.colorGroup === 'very_light' ? 'light' : garment.colorGroup
  const identity = garment.identity ?? {}
  return {
    ...emptyAddDraft,
    whose: garment.wearerId === null ? 'shared' : { wearerId: garment.wearerId },
    kind: (garmentKinds as readonly string[]).includes(garment.kind ?? '') ? garment.kind as GarmentKind : null,
    colour: group !== null && (colourChoices as readonly string[]).includes(group) ? group as ColourChoice : null,
    // A stored "Grey" shows as "Gray"; it is written back only if the color is changed.
    colorName: typeof garment.color === 'string' && garment.color !== colourWords[group as ColourChoice] ? colorText(garment.color) : '',
    tag: tagDraftFromCare(garment.care),
    material: garment.care?.material ?? null,
    fabricDetails: garment.care?.fabricDetails ?? detailsFromMaterial(garment.care?.material ?? null),
    dyeRun: garment.dyeRun ?? null,
    name: garment.name,
    occasions: garment.occasions,
    tags: clothingTags(garment),
    identity: { ...noIdentity, ...Object.fromEntries(Object.entries(identity).filter(([, value]) => typeof value === 'string')) },
  }
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/** Whether Edit holds unsaved answers, so a close asks Keep editing or Discard first. */
export function editDirty(before: AddDraft, draft: AddDraft, changes: { readonly quantity: number; readonly pieces: number; readonly removeCareCount: number; readonly careOnly?: boolean }): boolean {
  if (changes.careOnly === true) return !same(draft.tag, before.tag)
  return !same(draft, before) || changes.quantity !== changes.pieces || changes.removeCareCount !== 0
}

/**
 * The writes Edit makes: only what changed, for every garment on the hanger. The tag is written
 * again only when an answer changed, so recorded care the step cannot show is kept; a fabric change
 * alone is written by itself, so it saves even when the care cannot be shown as tag answers.
 */
export function editArgs(textileIds: readonly string[], before: AddDraft, after: AddDraft): {
  updates: FunctionArgs<typeof api.inventory.updateTextile>[]
  tag: FunctionArgs<typeof api.inventory.answerTagQuestions> | null
  material: FunctionArgs<typeof api.inventory.setMaterial> | null
} {
  const name = garmentName(after)
  const fields = {
    ...(name !== garmentName(before) && name.length > 0 ? { name } : {}),
    ...(after.kind !== before.kind && after.kind !== null ? { kind: after.kind } : {}),
    ...(!same(after.whose, before.whose) && after.whose !== null ? { wearerId: wearerIdOf(after.whose) as Id<'wearers'> | null } : {}),
    ...((after.colour !== before.colour || after.colorName !== before.colorName) && after.colour !== null ? { colorGroup: after.colour, color: after.colorName.trim() || colourWords[after.colour] } : {}),
    ...(after.dyeRun === before.dyeRun || after.dyeRun === null ? {} : { dyeRun: after.dyeRun, ...(after.dyeRun === 'new' ? { firstWash: true } : after.dyeRun === 'fast' ? { firstWash: false } : {}) }),
    ...(!same(after.occasions, before.occasions) && after.occasions !== null ? { occasions: [...after.occasions] } : {}),
    ...(!same(after.tags, before.tags) && after.tags !== undefined ? { tags: [...after.tags] } : {}),
    // Clearing every field removes the identity.
    ...(!same(after.identity, before.identity) ? { identity: identityArg(after.identity) ?? {} } : {}),
  }
  const updates = Object.keys(fields).length === 0 ? [] : textileIds.map((textileId) => ({ textileId: textileId as Id<'textiles'>, ...fields }))
  const ids = textileIds as Id<'textiles'>[]
  const fabricChanged = after.material !== before.material || !same(after.fabricDetails, before.fabricDetails)
  const fabricDetails = same(after.fabricDetails, before.fabricDetails) ? {} : { fabricDetails: after.fabricDetails ?? {} }
  // The save refuses a changed tag that is not complete, so a changed tag always has answers here.
  const answers = same(after.tag, before.tag) ? null : tagAnswers(after.tag)
  return {
    updates,
    tag: answers === null ? null : { textileIds: ids, ...answers, ...(fabricChanged ? { material: after.material, ...fabricDetails } : {}) },
    material: fabricChanged && answers === null ? { textileIds: ids, material: after.material, ...fabricDetails } : null,
  }
}

// ---- The sheet -----------------------------------------------------------------------

type Mutation<Name extends 'createTextiles' | 'createWearer' | 'updateTextile' | 'answerTagQuestions' | 'setMaterial'> = (typeof api.inventory)[Name]
type Call<Name extends 'createTextiles' | 'createWearer' | 'updateTextile' | 'answerTagQuestions' | 'setMaterial'> =
  (args: FunctionArgs<Mutation<Name>>) => Promise<FunctionReturnType<Mutation<Name>>>

export type AddCalls = {
  readonly createTextiles: Call<'createTextiles'>
  readonly addMatchingTextiles: (args: FunctionArgs<typeof api.inventory.addMatchingTextiles>) => Promise<FunctionReturnType<typeof api.inventory.addMatchingTextiles>>
  readonly trashTextiles: (args: FunctionArgs<typeof api.inventory.trashTextiles>) => Promise<FunctionReturnType<typeof api.inventory.trashTextiles>>
  readonly createWearer: Call<'createWearer'>
  readonly updateTextile: Call<'updateTextile'>
  readonly answerTagQuestions: Call<'answerTagQuestions'>
  readonly setMaterial: Call<'setMaterial'>
  readonly setPrivacy?: (args: FunctionArgs<typeof api.inventory.setPrivacy>) => Promise<unknown>
  readonly clearCare: (args: FunctionArgs<typeof api.closet.unflag>) => Promise<FunctionReturnType<typeof api.closet.unflag>>
  readonly uploadPhoto: (textileId: Id<'textiles'>, file: File) => Promise<void>
}

/** `kind` decides whether a baby bodysuit is offered. */
export type AddWearer = { readonly wearerId: string; readonly name: string; readonly kind?: WearerKind }

/** Newly added garments or edit results, used by the confirmation toast. */
export type AddSaved = {
  readonly target?: AddTarget
  readonly textileIds: readonly string[]
  readonly name: string
  readonly photoFailed: boolean
  readonly careReturned?: number
  readonly addedMatching?: number
  readonly movedToTrash?: number
  /** Add only: everything saved before Done; `textileIds` then covers every save. */
  readonly tally?: AddTally
}

/**
 * The one staged intake: type by its picture, then whose and how many, color, the care label, and a
 * last step with stains, where it goes, how dirty (for the hamper) and what will be saved. Stained
 * garments stay out of Ready and go to the hamper. A save shows what landed, with Add another,
 * Same again in another color, and Done; Done (or closing after a save) reports the tally to `onSaved`.
 */
export function AddClothesSheet({ householdId, mode, wearers, calls, initial, initialStep = 'type', initialCareStep, initialQuery, firstRun = false, emptyCloset = false, onClose, onSaved, knownTags = [], presentation, onReviewState, onReviewTransition }: {
  householdId: string
  mode: Extract<AddMode, { kind: 'add' }>
  wearers: readonly AddWearer[]
  calls: AddCalls
  initial?: AddDraft
  initialStep?: AddStep
  initialCareStep?: CareQuestion
  /** What the type step's search starts with: previews and tests of the results. */
  initialQuery?: string
  /** The first laundry intake: "What needs washing?". */
  firstRun?: boolean
  /** shortcut: first means empty visible inventory; upgrade to durable milestone history post-trial. */
  emptyCloset?: boolean
  knownTags?: readonly string[]
  presentation?: IntakePresentation
  onReviewState?: (state: IntakeReviewState) => void
  onReviewTransition?: (from: string, to: string) => void
  /** Closed before anything was saved. */
  onClose: () => void
  /** Done, or closed after at least one save: everything added since the sheet opened. */
  onSaved: (saved: AddSaved) => void
}) {
  // With one clothing profile (a first closet), it is that person's; with more, the sheet asks.
  // The hamper starts at Worn and the closet at Normal; how dirty is shown on the last step.
  const [start] = useState<AddDraft>(() => initial ?? { ...emptyAddDraft, whose: mode.whose ?? (wearers.length === 1 ? { wearerId: wearers[0]!.wearerId } : null), soil: soilFor(mode.target) })
  const [startingCloset] = useState(emptyCloset)
  // The draft lives here, above the steps, so Back and Next never lose an answer.
  const [draft, setDraft] = useState<AddDraft>(start)
  const [step, setStep] = useState<AddStep>(initialStep)
  const [careStep, setCareStep] = useState<CareQuestion>(() => initialCareStep ?? firstCareStep(start.tag))
  const [destination, setDestination] = useState<AddTarget>(mode.target)
  // Until the person picks how dirty, it follows where the clothes go.
  const [soilChosen, setSoilChosen] = useState(false)
  const [newWearers, setNewWearers] = useState<AddWearer[]>([])
  const [someoneNew, setSomeoneNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [savingTarget, setSavingTarget] = useState<AddTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  // What a closed sheet would be leaving: the draft and destination after the last save or reset.
  const [baseline, setBaseline] = useState<{ draft: AddDraft; destination: AddTarget }>({ draft: start, destination: mode.target })
  // Everything saved so far; the landed line shows the saved panel until the next garment starts.
  const [saved, setSaved] = useState<AddSaved | null>(null)
  const [landed, setLanded] = useState<string | null>(null)
  const [lastAdded, setLastAdded] = useState<Pick<Textile, 'textileId' | 'name' | 'personalRoutine'>[]>([])
  const [routineOpen, setRoutineOpen] = useState(false)
  const [pestOpen, setPestOpen] = useState(false)
  // "Same again" keeps the care answers; the color step says so.
  const [carried, setCarried] = useState(false)
  const id = useId()
  const saving = useRef(false)
  // Done reports once, however many taps reach it.
  const finished = useRef(false)
  const everyone = [...wearers, ...newWearers.filter((added) => !wearers.some((wearer) => wearer.wearerId === added.wearerId))]
  const wearerId = wearerIdOf(draft.whose)
  const name = garmentName(draft)
  const complete = draftComplete(mode, draft) && !someoneNew
  const careProblem = materialCareProblem(draft.material, tagAnswers(draft.tag))
  const set = (patch: Partial<AddDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const steps = stepsFor(draft.preOwned !== undefined)
  const stepIndex = steps.indexOf(step === 'label' ? 'final' : step)
  const previous = step === 'label' ? 'final' : steps[stepIndex - 1]
  const followingStep = step === 'label' ? 'final' : steps[stepIndex + 1]
  const whoseComplete = draft.whose !== null && !someoneNew
  const detailsComplete = (draft.kind !== 'other' || name.length > 0) && colorDrafts(draft).every((color) => Number.isInteger(color.count) && color.count >= 1) && pieceCount(draft) <= 20
  const dirty = landed === null && (!same(draft, baseline.draft) || destination !== baseline.destination || photo !== null || newName !== '')
  const screen = landed !== null ? 'saved' : step === 'care' ? `care:${careStep}` : step
  useLayoutEffect(() => { onReviewState?.({ screen, draft, dirty, pending, error }) }, [screen, draft, dirty, pending, error, onReviewState])
  const go = (to: AddStep, question = careStep) => { onReviewTransition?.(screen, to === 'care' ? `care:${question}` : to); setError(null); setStep(to) }
  // A tag that rules out washing (dry clean only, do not wash) has no bleach or tumble answers to keep.
  const careSteps: readonly CareQuestion[] = draft.tag.method === 'dry_clean_only' || draft.tag.method === 'do_not_wash' ? ['wash'] : ['wash', 'bleach', 'dry']
  const careIndex = Math.max(0, careSteps.indexOf(careStep))
  const careTag: TagDraft = { ...draft.tag, method: draft.tag.method ?? 'no_tag', bleach: draft.tag.bleach ?? 'unknown', dryer: draft.tag.dryer ?? 'unknown' }
  const stained = draft.stainAge === 'new'
  const setIn = draft.stainAge === 'set_in'
  const target: AddTarget = stained ? 'hamper' : destination
  const optionalLabelDetails = [
    draft.tag.iron === 'unknown' ? '' : draft.tag.iron === 'allowed' ? 'Ironing allowed' : draft.tag.iron === 'no' ? 'Do not iron' : `Iron, ${draft.tag.iron} heat`,
    draft.tag.steamPermission === undefined || draft.tag.steamPermission === 'unknown' ? '' : draft.tag.steamPermission === 'allowed' ? 'Steam allowed' : 'Do not steam',
    photo === null ? '' : 'Care label photo added',
  ].filter(Boolean).join(' · ')

  const addWearer = async (kind: WearerKind) => {
    const typed = newName.trim()
    if (pending || !typed) return
    setPending(true)
    setError(null)
    try {
      const created = await calls.createWearer({ householdId: householdId as Id<'households'>, name: typed, kind })
      setNewWearers((current) => [...current, { wearerId: created, name: typed, kind }])
      set({ whose: { wearerId: created } })
      setSomeoneNew(false)
      setNewName('')
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setPending(false) }
  }

  const stepComplete = step === 'type' ? draft.kind !== null : step === 'whose' ? whoseComplete : step === 'details' ? detailsComplete : step === 'fabric' ? fabricProblem(draft.material) === null : step === 'color' ? colorsComplete(draft) : step === 'stain' ? draft.stain !== null && stainAnswered(draft) : true

  const pickDestination = (to: AddTarget) => {
    setDestination(to)
    if (!soilChosen) set({ soil: soilFor(to) })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Enter on an earlier step goes on to the next one; it never saves.
    if (step === 'care') {
      const next = careSteps[careIndex + 1]
      if (pending) return
      set({ tag: careTag })
      if (next === undefined) go('stain')
      else { onReviewTransition?.(screen, `care:${next}`); setCareStep(next) }
      return
    }
    if (step !== 'final') { if (!pending && stepComplete && followingStep !== undefined) { if (step === 'dye' && draft.dyeRun === null) set({ dyeRun: 'unknown' }); go(followingStep) } return }
    if (saving.current || pending || !complete || careProblem !== null) return
    const args = createArgs(householdId, target, draft)
    if (args === null) return
    saving.current = true
    setPending(true)
    setSavingTarget(target)
    setError(null)
    try {
      const textileIds = await calls.createTextiles(args)
      const names = args.colors?.flatMap((color) => Array.from({ length: color.quantity }, () => color.name))
      setLastAdded(textileIds.map((textileId, index) => ({ textileId, name: names?.[index] ?? name })))
      let photoFailed = false
      if (photo !== null && textileIds[0] !== undefined) {
        try { await calls.uploadPhoto(textileIds[0], photo) }
        catch { photoFailed = true }
      }
      const added = textileIds.length
      setSaved((current) => ({
        target,
        name: draft.additionalColors?.length ? garmentName({ ...draft, colour: null, colorName: '' }) : name,
        textileIds: [...(current?.textileIds ?? []), ...textileIds],
        photoFailed: (current?.photoFailed ?? false) || photoFailed,
        tally: {
          closet: (current?.tally?.closet ?? 0) + (target === 'closet' ? added : 0),
          hamper: (current?.tally?.hamper ?? 0) + (target === 'hamper' ? added : 0),
          groups: (current?.tally?.groups ?? 0) + 1,
        },
      }))
      onReviewTransition?.(screen, 'saved')
      setLanded(landedWords(draft, target))
      setPhoto(null)
    } catch (caught) { setError(errorMessage(caught)) }
    finally { saving.current = false; setPending(false); setSavingTarget(null) }
  }

  /** Starts the next garment from the saved one's answers, at `to`. */
  const startNext = (next: AddDraft, to: AddStep, keepCare: boolean) => {
    setDraft(next)
    setBaseline({ draft: next, destination })
    setCareStep('wash')
    setSoilChosen(false)
    setCarried(keepCare)
    setLanded(null)
    setLastAdded([])
    setRoutineOpen(false)
    go(to)
  }
  const finish = () => {
    if (finished.current) return
    finished.current = true
    if (saved === null) onClose()
    else onSaved(saved)
  }

  // The running tally rides under the title once anything is saved.
  const tally = saved?.tally === undefined ? undefined : addGarmentText.tally(saved.tally.closet + saved.tally.hamper)
  if (landed !== null) {
    const firstSave = startingCloset && saved?.tally?.groups === 1
    return <Sheet title={presentation?.saved?.title ?? (firstSave ? addGarmentText.firstSavedTitle(saved.textileIds.length) : addGarmentText.savedTitle)} subtitle={tally} onClose={finish} step="saved" closeAtTop footer={
      <TaskFooter>
        <Button type="button" size="lg" onClick={finish} style={presentation?.saved?.color ? { backgroundColor: presentation.saved.color, color: '#fff' } : undefined}>{presentation?.saved?.action ?? addGarmentText.done}</Button>
      </TaskFooter>
    }>
      <div className={addLandedClassName}>
        <CompletionMark animate={firstSave} className="size-12" />
        <p className={addLandedLineClassName} role="status">{landed}</p>
      </div>
      {/* Done is the footer's one action; routine and repeat choices stay in the list. */}
      <ActionList label={addGarmentText.addMore} chevrons actions={[
        { key: 'routine', label: 'Wash & dry preferences', onClick: () => setRoutineOpen(true) },
        { key: 'same', label: addGarmentText.sameAgain, hint: addGarmentText.sameAgainHint, onClick: () => startNext(sameAgain(draft), 'color', true) },
        { key: 'another', label: addGarmentText.addAnother, onClick: () => startNext(addAnother(draft, destination), 'type', false) },
      ]} />
      <PersonalRoutine textiles={lastAdded} open={routineOpen} onClose={() => setRoutineOpen(false)} />
    </Sheet>
  }

  const care = step === 'care'
  const back = () => {
    const previousCare = careSteps[careIndex - 1]
    if (care && previousCare !== undefined) { onReviewTransition?.(screen, `care:${previousCare}`); setError(null); setCareStep(previousCare) }
    else if (previous !== undefined) go(previous)
  }
  const override = presentation?.[screen]
  const title = override?.title ?? (care ? careQuestionText[careStep].title : firstRun && step === 'type' ? bulkText.firstTitle : addGarmentText.steps[step].title)
  const next = override?.action ?? (care ? addGarmentText.careNext : followingStep === undefined ? '' : addGarmentText.steps[followingStep].to)
  const primaryStyle = override?.color ? { backgroundColor: override.color, color: '#fff' } : undefined

  const primary = step === 'final'
    ? <Button type="submit" form={id} size="lg" style={primaryStyle} disabled={pending || !complete || careProblem !== null}>{savingTarget === null ? override?.action ?? addGarmentText.save : addClothesText.adding}</Button>
    // Picking a tile advances, so the type step offers Next only when coming back to a picked type; without it the sheet keeps no empty footer bar.
    : step === 'type' && draft.kind === null ? null : <Button type="submit" form={id} size="lg" style={primaryStyle} disabled={pending || !stepComplete}>{next}</Button>

  const carePosition = steps.indexOf('care')
  const progress = { step: stepIndex + 1 + (care ? careIndex : stepIndex > carePosition ? careSteps.length - 1 : 0), total: steps.length + careSteps.length - 1 }
  return <Sheet title={title} progress={progress} subtitle={tally} onClose={finish} closeAtTop onBack={previous === undefined ? undefined : back} step={care ? `care:${careStep}` : step} dirty={dirty} busy={pending} titleId={`${id}-title`} tall={!care} footer={<>
    {error === null && (step !== 'final' || careProblem === null) ? null : <p className={cn(noticeClassName, badClassName)} role="alert">{error ?? careProblem}</p>}
    {primary === null ? null : <TaskFooter>{primary}</TaskFooter>}
  </>}>
    <form id={id} className={addClothesFormClassName} onSubmit={(event) => void submit(event)} aria-busy={pending}>
      <FieldSet disabled={pending} className={addClothesFieldsClassName}>
        <FieldGroup>
          {step === 'type' ? <>
            {/* The sheet's heading names the tiles and the results. */}
            <GarmentTypePicker labelledBy={`${id}-title`} kinds={intakeKinds(everyone)} value={draft.kind} initialQuery={initialQuery}
              onPick={(pick) => { setDraft((current) => pickType(current, pick)); go('whose') }} />
          </> : null}
          {step === 'whose' ? <>
            <PersonChoices label={addClothesText.titles.whose} value={someoneNew ? 'new' : draft.whose === 'shared' ? 'shared' : wearerId ?? ''} onPick={(value) => {
              if (value === 'new') { setSomeoneNew(true); return }
              setSomeoneNew(false)
              set({ whose: value === 'shared' ? 'shared' : { wearerId: value } })
            }} options={[...everyone.map((wearer) => ({ value: String(wearer.wearerId), label: wearer.name, mark: wearer.name.trim().charAt(0).toUpperCase() })), { value: 'shared', label: addClothesText.shared, mark: <DesignIcon name="home" size={20} /> }, { value: 'new', label: addClothesText.someoneNew, mark: <DesignIcon name="plus" size={20} /> }]} />
            {someoneNew ? <FieldGroup className={someoneNewClassName}>
              <Field><FieldLabel htmlFor={`${id}-person`}>{addClothesText.name}</FieldLabel><Input id={`${id}-person`} value={newName} maxLength={60} autoComplete="off" onChange={(event) => setNewName(event.target.value)} /></Field>
              <AnswerRow label={addClothesText.personKind} disabled={pending || !newName.trim()} answers={wearerKinds.map((kind) => ({ key: kind, label: wearerKindWords[kind], onClick: () => void addWearer(kind) }))} />
            </FieldGroup> : null}
          </> : null}
          {step === 'details' ? <>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>{addClothesText.name}</FieldLabel>
              <Input id={`${id}-name`} value={draft.name ?? ''} maxLength={80} required={draft.kind === 'other'} autoComplete="off" placeholder={`e.g. ${derivedName({ kind: draft.kind, colour: 'white', colorName: 'White', article: draft.article }) || 'Laundry item'}`} aria-describedby={`${id}-name-hint`} onChange={(event) => set({ name: event.target.value, nameFromSearch: false })} />
              <FieldDescription id={`${id}-name-hint`}>{draft.kind === 'other' ? addGarmentText.otherNameHint : addGarmentText.nameHint(derivedName({ kind: draft.kind, colour: 'medium', colorName: 'Gray', article: draft.article }) || 'Gray T-shirt')}</FieldDescription>
            </Field>
            <GarmentIdentity draft={draft} onChange={set} quantity={<Field>
              <FieldLabel htmlFor={`${id}-quantity`}>{addGarmentText.countLabel}</FieldLabel>
              <Input id={`${id}-quantity`} type="number" inputMode="numeric" min={1} max={20} step={1} required value={Number.isFinite(draft.count) ? draft.count : ''} aria-describedby={`${id}-quantity-hint`} onChange={(event) => set({ count: event.currentTarget.valueAsNumber })} />
              <FieldDescription id={`${id}-quantity-hint`}>{draft.additionalColors?.length ? 'Pieces in the first color.' : 'You can split colors in the color step.'}</FieldDescription>
            </Field>} />
            <MoreDetails draft={draft} onChange={set} knownTags={knownTags} />
          </> : null}
          {step === 'fabric' ? <FabricChoices value={draft.material} details={draft.fabricDetails} onDetails={(fabricDetails) => set({ fabricDetails })} onChange={(material) => setDraft((current) => draftWithMaterial(current, material))} heading={false} /> : null}
          {step === 'color' ? <>
            {carried ? <p className={carriedCareClassName}>{addGarmentText.carriedCare}</p> : null}
            <ColorBreakdown draft={draft} onChange={set} />
          </> : null}
          {step === 'origin' ? <OriginChoices draft={draft} onChange={set} /> : null}
          {step === 'dye' ? draft.additionalColors?.length ? <>
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => set({ dyeRun: 'new', additionalColors: draft.additionalColors!.map((color) => ({ ...color, dyeRun: 'new' })) })}>All new, not washed yet</Button>
            {colorDrafts(draft).map((color, index) => <Field key={index}><FieldLabel htmlFor={`${id}-dye-${index}`}>{color.colorName || colourWords[color.colour!]}</FieldLabel><NativeSelect id={`${id}-dye-${index}`} value={color.dyeRun ?? 'unknown'} onChange={(event) => { const dyeRun = event.target.value as DyeRun; set(index === 0 ? { dyeRun } : { additionalColors: draft.additionalColors!.map((item, at) => at === index - 1 ? { ...item, dyeRun } : item) }) }}>{dyeRunStates.map((value) => <option key={value} value={value}>{addGarmentText.dyeRuns[value]}</option>)}</NativeSelect></Field>)}
          </> : <DyeRunChoices value={draft.dyeRun} onChange={(dyeRun) => set({ dyeRun })} heading={false} /> : null}
          {care ? <>
            <p className="m-0 text-ink-2 text-[length:var(--step-0)] leading-normal">{careQuestionText[careStep].lead}</p>
            <CareChoices material={draft.material} question={careStep} draft={careTag} onChange={(tag) => set({ tag })} />
          </> : null}
          {step === 'label' ? <>
            <p className="m-0 text-ink-2">Copy the iron and steam symbols. Leave missing instructions unknown.</p>
            <TagRows material={draft.material} only="more" value={tagRows(draft.tag)} onChange={({ wash: _wash, ...patch }) => set({ tag: { ...draft.tag, ...patch } })} />
            <TagPhoto photo={photo} onPhoto={setPhoto} />
          </> : null}
          {step === 'stain' ? <>
            <p className="m-0 text-ink-2 text-[length:var(--step-0)] leading-normal">{addGarmentText.stainLead}</p>
            <ChoiceTiles label={addGarmentText.stainTitle} value={draft.stain} onPick={(stain) => set({ stain, stainAge: stain === 'none' ? null : draft.stainAge })} options={intakeStains.map((stain) => ({ value: stain, label: addGarmentText.stains[stain], art: stainArt[stain] }))} />
            {draft.stain === null || draft.stain === 'none' ? null : <div className="grid gap-2">
              <span className="flex items-center gap-1 text-[length:var(--step-1)] font-semibold">{addGarmentText.stainAgeTitle}<HelpTip topic={helpTipText.intake.setIn.topic}>{helpTipText.intake.setIn.words}</HelpTip></span>
              <SegmentChoice label={addGarmentText.stainAgeTitle} value={draft.stainAge ?? ''} onChange={(age) => set({ stainAge: age as StainAge })} options={stainAges.map((age) => ({ value: age, label: addGarmentText.stainAges[age] }))} />
            </div>}
            {setIn ? <p className="m-0 text-ink-2 text-[length:var(--step--1)] leading-[1.45]" role="status">{addGarmentText.knownMarkHint}</p> : null}
          </> : null}
          {step === 'final' ? <>
            {name.length === 0 ? null : <p className={saveSummaryClassName}>
              <span className="text-ink-2 text-[length:var(--step--1)]">{addGarmentText.summaryLabel}</span>
              <strong className="font-semibold">{draft.additionalColors?.length ? `${pieceCount(draft)} pieces · ${addGarmentText.destinations[target]}` : addGarmentText.summary(name, draft.count, addGarmentText.destinations[target])}</strong>
              {setIn ? <span className="text-ink-2 text-[length:var(--step--1)]">{addGarmentText.knownMarkSummary}</span> : null}
            </p>}
            {draft.additionalColors?.length ? <>
              <ul className="m-0 grid list-none gap-2 p-0">{colorDrafts(draft).map((color, index) => <li key={index} className="flex min-w-0 justify-between gap-3"><span>{garmentName({ ...draft, ...color })}</span><span className="text-ink-2">×{color.count}</span></li>)}</ul>
              <ItemGroup><OriginCheckbox title="These pieces have the same care instructions" checked={draft.sameCareInstructions === true} onChange={(sameCareInstructions) => set({ sameCareInstructions })} /></ItemGroup>
            </> : null}
            {stained ? <p className="m-0 text-ink-2 text-[length:var(--step-0)] leading-normal" role="status">{draft.tag.method === 'dry_clean_only' ? addGarmentText.stainDryCleanDestination : addGarmentText.stainDestination}</p> : <SegmentChoice label={addGarmentText.saveTo} value={destination} onChange={(to) => pickDestination(to as 'closet' | 'hamper')} options={(['closet', 'hamper'] as const).map((to) => ({ value: to, label: addGarmentText.destinations[to] }))} />}
            {target === 'hamper' ? <div className="grid gap-2">
              <span className="text-[length:var(--step-1)] font-semibold">{addClothesText.titles.soil}</span>
              <SegmentChoice label={addClothesText.titles.soil} value={draft.soil} onChange={(soil) => { setSoilChosen(true); set({ soil: soil as SoilLevel }) }} options={soilLevels.map((soil) => ({ value: soil, label: soilButtonWords[soil] }))} />
            </div> : null}
            <section className="grid gap-3" aria-label={addGarmentText.careReview}>
            <h3 className="m-0 text-[length:var(--step-1)] font-semibold">{addGarmentText.careReview}</h3>
            <div className="grid min-w-0 rounded-control bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
              {careSteps.map((question) => <button key={question} type="button" aria-label={`Edit ${careQuestionText[question].cell.toLowerCase()}`} className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 text-start text-ink [&+&]:[border-block-start:1px_solid_var(--line)]" onClick={() => { setCareStep(question); go('care', question) }}>
                <CareSymbol kind={question === 'wash' && draft.tag.method === 'dry_clean_only' ? 'dry_clean_p' : question === 'wash' && draft.tag.method === 'do_not_wash' ? 'do_not_wash' : careReviewSymbol[question]} size={28} decorative />
                <span className="grid min-w-0 flex-1"><span className="text-ink-2 text-[length:var(--step--1)]">{careQuestionText[question].cell}</span><span className="font-semibold [overflow-wrap:anywhere]">{question === 'wash' ? tubWords(tagRows(draft.tag)) : question === 'bleach' ? bleachWords[draft.tag.bleach ?? 'unknown'] : draft.tag.dryer === 'no_tumble' && draft.tag.natural !== null ? careSymbolWords[draft.tag.natural === 'flat' ? 'dry_flat' : draft.tag.natural === 'line' ? 'line_dry' : 'drip_dry'] : dryerWords[draft.tag.dryer ?? 'unknown']}</span></span>
                <DesignIcon name="chevronRight" size="1em" strokeWidth={2.2} className="size-4 flex-none text-muted-foreground" aria-hidden="true"  />
              </button>)}
              {optionalLabelDetails === '' ? null : <button type="button" aria-label="Edit more on the label" className="flex min-h-14 items-center gap-3 border-0 border-t border-solid border-line bg-transparent px-3 text-start text-ink" onClick={() => go('label')}><CareSymbol kind="iron_low" size={28} decorative /><span className="grid min-w-0 flex-1 [overflow-wrap:anywhere]"><span className="text-ink-2 text-[length:var(--step--1)]">{addGarmentText.moreOnLabel}</span><span className="font-semibold">{optionalLabelDetails}</span></span><DesignIcon name="chevronRight" size="1em" aria-hidden="true" /></button>}
            </div>
            {optionalLabelDetails === '' ? <Button type="button" variant="outline" className="justify-self-start" aria-label="Edit more on the label" onClick={() => go('label')}>Add label details</Button> : null}
            </section>
            {draft.preOwned === undefined ? null : <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setPestOpen(true)}>{draft.preOwned.heatTreat ? 'Pest treatment: heat-treat first' : 'Pest treatment options'}</Button>}
          </> : null}
        </FieldGroup>
      </FieldSet>
    </form>
    {!pestOpen || draft.preOwned === undefined ? null : <Sheet title="Pest treatment" onClose={() => setPestOpen(false)} closeAtTop footer={<Button type="button" onClick={() => setPestOpen(false)}>Back to garment</Button>}>
      <p className="m-0 text-ink-2">For suspected pest exposure only, separate from normal care.</p>
      <HeatTreatChoice draft={draft.preOwned} allowed={draftAllowsHighHeat(draft.tag)} onChange={(preOwned) => set({ preOwned })} />
    </Sheet>}
  </Sheet>
}

/** A different blend requires reading its own label again; percentages alone do not change fibers. */
export function draftWithMaterial(draft: AddDraft, material: string | null): AddDraft {
  const fibers = (value: string | null) => parseFabric(value).map(({ fiber, name }) => `${fiber}:${name}`).sort().join('|')
  const fabricDetails = detailsForMaterial(material, draft.fabricDetails)
  if (fibers(material) === fibers(draft.material)) return { ...draft, material, fabricDetails }
  return { ...draft, material, fabricDetails, tag: emptyTag, sameCareInstructions: undefined, ...(draft.preOwned === undefined ? {} : { preOwned: { ...draft.preOwned, heatTreat: false } }) }
}

/** How dirty new clothes start: worn for the hamper, normal otherwise (a stain on a closet add). */
const soilFor = (target: AddTarget): SoilLevel => (target === 'hamper' ? 'light' : 'normal')

/** Tiles people pick by picture, with radio or checkbox semantics and tinted selections. */
function ChoiceTiles<Value extends string>({ label, options, value, onPick }: {
  label: string
  options: readonly { value: Value; label: string; art: ReactNode }[]
  value: Value | null | readonly Value[]
  onPick: (value: Value) => void
}) {
  return <div role={Array.isArray(value) ? 'group' : 'radiogroup'} aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(max(4.5rem,calc((100%_-_1rem)_/_3)),1fr))] gap-2">
    {options.map((option) => {
      const chosen = typeof value === 'string' ? option.value === value : value?.includes(option.value) ?? false
      return <button key={option.value} type="button" role={Array.isArray(value) ? 'checkbox' : 'radio'} aria-checked={chosen} onClick={() => onPick(option.value)} className={cn('relative grid min-h-[76px] min-w-0 cursor-pointer content-center justify-items-center gap-0.5 rounded-label border-0 px-0.5 pb-2 pt-1 text-center text-[length:max(13px,var(--step--1))] font-semibold leading-[1.15] text-ink [overflow-wrap:anywhere]', chosen ? 'bg-accent shadow-[inset_0_0_0_2px_var(--link)]' : 'bg-surface shadow-[inset_0_0_0_1px_var(--line)]')}>
        <span aria-hidden="true" className="grid size-7 place-items-center">{option.art}</span>
        <span>{option.label}</span>
      </button>
    })}
  </div>
}

/** One choice out of a few long answers: a ruled list, each row with its symbol and a ring. */
function RadioList<Value extends string>({ label, options, value, onPick }: {
  label: string
  options: readonly { value: Value; label: string; art: ReactNode }[]
  value: Value | null
  onPick: (value: Value) => void
}) {
  return <div role="radiogroup" aria-label={label} className="grid rounded-control bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onPick(option.value)} className="flex min-h-12 w-full cursor-pointer items-center gap-[12px] border-0 bg-transparent px-[12px] py-2 text-start text-[length:var(--step-0)] font-semibold text-ink [&+&]:[border-block-start:1px_solid_var(--line)] [&>span:last-child]:size-[24px] [&>span:last-child>span]:size-[10px]">
      <span aria-hidden="true" className="grid size-[24px] flex-none place-items-center text-ink-2">{option.art}</span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option.label}</span>
      <Ring on={value === option.value} />
    </button>)}
  </div>
}

const stainArt: Record<IntakeStain, ReactNode> = {
  none: <DesignIcon name="sparkles" size={24}  />, food: <DesignIcon name="utensils" size={24}  />, grease: <DesignIcon name="drop" size={24}  />, ink: <DesignIcon name="pen" size={24}  />, other: <DesignIcon name="ellipsis" strokeWidth={2.2} size={24}  />,
}

const fabricArt: Record<(typeof fabrics)[number], ReactNode> = {
  cotton: <DesignIcon name="flower" size={24}  />, polyester: <DesignIcon name="flask" size={24}  />, wool: <DesignIcon name="cloud" size={24}  />, silk: <DesignIcon name="sparkles" size={24}  />,
  linen: <DesignIcon name="leaf" size={24}  />, nylon: <DesignIcon name="wind" size={24}  />, rayon: <DesignIcon name="waves" size={24}  />, elastane: <DesignIcon name="wind" size={24} />, modal: <DesignIcon name="leaf" size={24} />,
}

const dyeArt: Record<DyeRun, ReactNode> = {
  new: <DesignIcon name="sparkles" size={22}  />, bleeds: <DesignIcon name="drop" size={22}  />, fast: <DesignIcon name="shieldCheck" size={22}  />, unknown: <DesignIcon name="help" size={22}  />,
}

/** A generic symbol per label question, beside the answer already read from the tag. */
const careReviewSymbol = { wash: 'wash', bleach: 'bleach', dry: 'tumble_dry' } as const satisfies Record<CareQuestion, CareSymbolKind>

/** A title line with its optional "?" tip. */
function QuestionTitle({ title, tip, optional = false }: { title: string; tip?: { topic: string; words: string }; optional?: boolean }) {
  return <span className="flex flex-wrap items-center gap-1 text-[length:var(--step-1)] font-semibold">{title}{optional ? <span className="text-[length:var(--step--1)] font-normal text-ink-2">(optional)</span> : null}{tip === undefined ? null : <HelpTip topic={tip.topic}>{tip.words}</HelpTip>}</span>
}

/** Every label fiber, with optional percentages; the care record remains readable text. */
function ColorPicker({ value, onChange }: { value: ColorDraft; onChange: (patch: Partial<ColorDraft>) => void }) {
  const id = useId()
  const [base, setBase] = useState(() => namedColourName(value.colorName))
  const pick = (colorName: string, colour: ColourChoice) => { setBase(colorName); if (colorName !== base) onChange({ colorName, colour, dyeRun: 'unknown' }) }
  return <>
    <NamedColourGrid value={base ?? value.colorName} group={value.colour} onPick={pick} />
    {base === 'Mixed' ? <div className="grid gap-2"><span className="font-semibold">{addGarmentText.mixedShade}</span><SegmentChoice label={addGarmentText.mixedShade} value={value.colour ?? ''} onChange={(colour) => onChange({ colour: colour as ColourChoice })} options={(['light', 'dark', 'unknown'] as const).map((colour) => ({ value: colour, label: addGarmentText.mixedShades[colour] }))} /></div> : colourShades[base ?? ''] === undefined ? null : <div className="grid gap-2"><span className="font-semibold">{addGarmentText.shade}</span><SegmentChoice label={addGarmentText.shade} value={value.colour === 'saturated' ? 'medium' : value.colour ?? ''} onChange={(colour) => onChange({ colour: colour === 'medium' && base === 'Red' ? 'saturated' : colour as ColourChoice })} options={(['light', 'medium', 'dark', 'unknown'] as const).map((colour) => ({ value: colour, label: <span className="grid justify-items-center gap-1"><span aria-hidden="true" className="size-6 rounded-full border border-solid border-line" style={{ background: colour === 'unknown' ? 'transparent' : colourShades[base!]![colour].fill }} /><span>{colour === 'unknown' ? addGarmentText.shadeUnknown : colourWords[colour]}</span></span> }))} /></div>}
    <MoreSection title={addClothesText.exactColor}><Field><FieldLabel htmlFor={id}>{addClothesText.exactColor}</FieldLabel><Input id={id} value={value.colorName} maxLength={60} autoComplete="off" placeholder={addGarmentText.colorNamePlaceholder} onChange={(event) => onChange({ colorName: event.target.value, dyeRun: 'unknown' })} /></Field></MoreSection>
  </>
}

function ColorBreakdown({ draft, onChange }: { draft: AddDraft; onChange: (patch: Partial<AddDraft>) => void }) {
  const [editing, setEditing] = useState(0)
  const colors = colorDrafts(draft)
  const selected = Math.min(editing, colors.length - 1)
  const change = (index: number, patch: Partial<ColorDraft>) => onChange(index === 0 ? patch : { additionalColors: draft.additionalColors!.map((color, at) => at === index - 1 ? { ...color, ...patch } : color) })
  const add = () => {
    const split = draft.count > 1
    onChange({ count: split ? draft.count - 1 : draft.count, additionalColors: [...draft.additionalColors ?? [], { colour: null, colorName: '', count: 1, dyeRun: 'unknown' }], sameCareInstructions: false })
    setEditing(colors.length)
  }
  const remove = (index: number) => {
    const remaining = colors.filter((_, at) => at !== index)
    onChange({ ...remaining[0]!, additionalColors: remaining.length > 1 ? remaining.slice(1) : undefined, sameCareInstructions: false })
    setEditing(0)
  }
  return <>
    <ColorPicker key={selected} value={colors[selected]!} onChange={(patch) => change(selected, patch)} />
    {colors.length < 2 ? null : <div className="grid gap-2" aria-label="Colors in this pack">
      {colors.map((color, index) => {
        const label = color.colorName || `Color ${index + 1}`
        return <div key={index} className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" className={cn(choiceChipVariants(), 'min-w-[44px] flex-1 whitespace-normal [@container_(width_<_16rem)]:basis-full')} aria-pressed={index === selected} onClick={() => setEditing(index)}>{label}</button>
          <div className="min-w-0 flex-none [&_.field-label]:sr-only [&_.stepper-controls]:grid-cols-[44px_minmax(2ch,auto)_44px]">
            <Stepper label={label} value={color.count} min={1} max={20 - pieceCount(draft) + color.count} onChange={(count) => change(index, { count })} />
          </div>
          <Button type="button" variant="outline" size="icon" className="w-[44px]" aria-label={`Remove ${label}`} onClick={() => remove(index)}><DesignIcon name="x" size={18} /></Button>
        </div>
      })}
      <p className="m-0 text-ink-2" role="status">{pieceCount(draft)} pieces total</p>
      {colors.every((color) => Number.isInteger(color.count) && color.count >= 1) && pieceCount(draft) <= 20 ? null : <p role="alert" className="m-0 text-conflict-ink">Use whole quantities totaling 1–20 pieces.</p>}
    </div>}
    <Button type="button" variant="outline" className="justify-self-start" disabled={colors.length >= 20 || (pieceCount(draft) >= 20 && draft.count <= 1) || !colorsComplete(draft)} onClick={add}><DesignIcon name="plus" size={18} />Add another color</Button>
  </>
}

function FabricChoices({ value, details, onDetails, onChange, heading = true, editing = false }: { value: string | null; details?: FabricDetails; onDetails: (details: FabricDetails | undefined) => void; onChange: (value: string | null) => void; /** The intake step's own heading already asks it. */ heading?: boolean; editing?: boolean }) {
  const id = useId()
  const [parts, setParts] = useState(() => parseFabric(value))
  const change = (next: FiberShare[]) => { const parts = next.length === 1 ? next.map((part) => ({ ...part, percentage: null })) : next; setParts(parts); onChange(formatFabric(parts)) }
  const problem = fabricProblem(value)
  const pick = (fiber: FiberShare['fiber']) => change(parts.some((part) => part.fiber === fiber) ? parts.filter((part) => part.fiber !== fiber) : [...parts, { fiber, name: '', percentage: null }])
  const toggle = (values: readonly string[], word: string) => values.includes(word) ? values.filter((value) => value !== word) : [...values, word]
  return <div className="grid gap-2">
    {heading ? <QuestionTitle title={addGarmentText.fabricTitle} /> : null}
    <span className="text-[length:var(--step--1)] leading-[1.45] text-ink-2">{addGarmentText.fabricHint}</span>
    <ChoiceTiles label={addGarmentText.fabricTitle} value={parts.map((part) => part.fiber)} onPick={pick} options={fabrics.map((fabric) => ({ value: fabric, label: addGarmentText.fabrics[fabric], art: fabricArt[fabric] }))} />
    <MoreSection title="More fibers" variant={editing ? 'section' : 'card'}>
      <div role="group" aria-label="More fibers" className="flex min-w-0 flex-wrap gap-2">
        {moreFabrics.map((fiber) => <button key={fiber} type="button" className={choiceChipVariants()} role="checkbox" aria-checked={parts.some((part) => part.fiber === fiber)} onClick={() => pick(fiber)}>{fabricLabel(fiber)}</button>)}
      </div>
    </MoreSection>
    {parts.length === 0 ? null : <div className="grid gap-2">
      {parts.length < 2 ? null : <p id={`${id}-percentages-hint`} className="m-0 text-[length:var(--step--1)] text-ink-2">Optional. Editing one balances the rest. Check against the label.</p>}
      {parts.map((part, index) => parts.length < 2 && part.fiber !== 'other' ? null : <div key={index} className={parts.length < 2 ? 'grid min-w-0 gap-2' : 'grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] items-center gap-2 [@container_(width_<_16rem)]:grid-cols-1'}>
        {part.fiber === 'other' ? <Field>
          <FieldLabel htmlFor={`${id}-name-${index}`}>Other material{parts.filter((item) => item.fiber === 'other').length > 1 ? ` ${index + 1}` : ''}</FieldLabel>
          <Input id={`${id}-name-${index}`} value={part.name} maxLength={60} placeholder="e.g. Elastane" onChange={(event) => change(parts.map((item, at) => at === index ? { ...item, name: event.target.value } : item))} />
        </Field> : parts.length < 2 ? null : <FieldLabel htmlFor={`${id}-percentage-${index}`}>{fabricLabel(part.fiber)}</FieldLabel>}
        {parts.length < 2 ? null : <div className="flex min-w-0 items-center gap-1">
          <Input id={`${id}-percentage-${index}`} className="min-w-0 px-2" type="number" inputMode="decimal" min={0.01} max={100} step="any" placeholder={index === 0 ? 'e.g. 80' : 'e.g. 20'} aria-label={`${fabricLabel(part.fiber)} percentage`} aria-describedby={`${id}-percentages-hint`} value={part.percentage ?? ''} onChange={(event) => change(balanceFabric(parts, index, Number.isFinite(event.currentTarget.valueAsNumber) ? event.currentTarget.valueAsNumber : null))} />
          <span aria-hidden="true">%</span>
        </div>}
      </div>)}
    </div>}
    {problem === null ? null : <p role="alert" className="m-0 text-warn-ink font-semibold">{problem}</p>}
    <MoreSection title="Advanced fabric details" variant={editing ? 'section' : 'card'}>
      <p className="m-0 text-ink-2">Only what the label or maker states.</p>
      {parts.map((part) => {
        const fiber = part.fiber === 'other' ? part.name.trim().toLowerCase() : part.fiber
        const values = details?.fibers?.find((entry) => entry.fiber === fiber)?.details ?? []
        const suggestions = Object.hasOwn(fiberDetailSuggestions, fiber) ? fiberDetailSuggestions[fiber as typeof fabricFibers[number]] ?? [] : []
        return suggestions.length + values.length === 0 ? null : <div key={fiber} className="grid gap-2">
          <span className="font-semibold">{fabricLabel(fiber)}</span>
          <div role="group" aria-label={`${fabricLabel(fiber)} details`} className="flex min-w-0 flex-wrap gap-2">
            {[...new Set([...suggestions, ...values])].map((word) => <button key={word} type="button" className={choiceChipVariants()} aria-pressed={values.includes(word)} onClick={() => onDetails({ ...details, fibers: [...details?.fibers?.filter((entry) => entry.fiber !== fiber) ?? [], { fiber, details: toggle(values, word) }].filter((entry) => entry.details.length > 0) })}>{word}</button>)}
          </div>
        </div>
      })}
      <div className="grid gap-2"><span className="font-semibold">Construction</span>
        <div role="group" aria-label="Fabric construction" className="flex min-w-0 flex-wrap gap-2">
          {[...new Set([...fabricConstructions, ...details?.construction ?? []])].map((word) => <button key={word} type="button" className={choiceChipVariants()} aria-pressed={details?.construction?.includes(word) ?? false} onClick={() => onDetails({ ...details, construction: toggle(details?.construction ?? [], word) })}>{word}</button>)}
        </div>
      </div>
      <div className="grid gap-2"><span className="font-semibold">Finishes</span>
        <div role="group" aria-label="Fabric finishes" className="flex min-w-0 flex-wrap gap-2">
          {[...new Set([...fabricFinishes, ...details?.finishes ?? []])].map((word) => <button key={word} type="button" className={choiceChipVariants()} aria-pressed={details?.finishes?.includes(word) ?? false} onClick={() => onDetails({ ...details, finishes: toggle(details?.finishes ?? [], word) })}>{word}</button>)}
        </div>
      </div>
    </MoreSection>
  </div>
}

function OriginCheckbox({ title, fact, checked, onChange }: { title: string; fact?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  return <li><Item variant="interactive" render={<label />}>
    <ItemMedia variant="icon"><GarmentIcon kind="other" /></ItemMedia>
    <ItemContent><ItemTitle id={`${id}-title`}>{title}</ItemTitle>{fact === undefined ? null : <ItemDescription id={id}>{fact}</ItemDescription>}</ItemContent>
    <ItemActions><Checkbox checked={checked} aria-labelledby={`${id}-title`} aria-describedby={fact === undefined ? undefined : id} onCheckedChange={(next) => onChange(next === true)} /></ItemActions>
  </Item></li>
}

/** The origin choice; a pre-owned piece swaps the dye question for what is different about it. */
function OriginChoices({ draft, onChange }: { draft: AddDraft; onChange: (patch: Partial<AddDraft>) => void }) {
  const text = addGarmentText.preOwned
  const pre = draft.preOwned
  return <>
    <p className="m-0 text-ink-2 text-[length:var(--step-0)] leading-normal">{pre === undefined ? helpTipText.intake.preOwned.words : text.dyeNote}</p>
    <ItemGroup aria-label={text.title}>
      <OriginCheckbox title={text.choice} checked={pre !== undefined} onChange={(checked) => onChange(checked ? { preOwned: emptyPreOwned, dyeRun: 'unknown' } : { preOwned: undefined })} />
    </ItemGroup>
    {pre === undefined ? null : <>
      <div className="grid gap-2">
        <QuestionTitle title={text.smellTitle} optional />
        <AnswerRow label={text.smellTitle} answers={smells.map((smell) => ({ key: smell, label: text.smells[smell], pressed: pre.smell === smell, onClick: () => onChange({ preOwned: { ...pre, smell: pre.smell === smell ? null : smell } }) }))} />
      </div>
      <ItemGroup aria-label={text.conditionTitle}>
        <OriginCheckbox title={text.fragile} fact={text.fragileHint} checked={pre.fragile} onChange={(fragile) => onChange({ preOwned: { ...pre, fragile } })} />
      </ItemGroup>
    </>}
  </>
}

/** Pest treatment is opt-in and distinct from normal drying permission. */
function HeatTreatChoice({ draft, allowed, onChange }: { draft: PreOwnedDraft; allowed: boolean; onChange: (draft: PreOwnedDraft) => void }) {
  const text = addGarmentText.preOwned
  return <>
    {allowed ? <div className="grid gap-2">
      <QuestionTitle title={text.heatTitle} optional />
      <span className="text-[length:var(--step--1)] leading-[1.45] text-ink-2">{text.heatHint}</span>
      <ItemGroup aria-label={text.heatTitle}>
        <SwitchRow role="checkbox" media={<DesignIcon name="dryer" />} title={text.heatChoice} on={draft.heatTreat} onToggle={() => onChange({ ...draft, heatTreat: !draft.heatTreat })} />
      </ItemGroup>
    </div> : <p className="m-0 text-ink-2 text-[length:var(--step--1)] leading-[1.45]">{text.noHeat}</p>}
    {allowed && draft.heatTreat ? <TrialNote>{trialText.preOwnedHeat}</TrialNote> : null}
  </>
}

function DyeRunChoices({ value, onChange, heading = true }: { value: DyeRun | null; onChange: (value: DyeRun) => void; /** The intake step's own heading already asks it. */ heading?: boolean }) {
  return <div className="grid gap-2">
    {heading ? <QuestionTitle title={addGarmentText.dyeRunTitle} /> : null}
    <RadioList label={addGarmentText.dyeRunTitle} value={value ?? 'unknown'} onPick={onChange} options={dyeRunStates.map((state) => ({ value: state, label: addGarmentText.dyeRuns[state], art: dyeArt[state] }))} />
    <div className="flex items-center gap-1 text-ink-2 text-[length:var(--step-0)] leading-normal">
      {helpTipText.intake.dyeRun.hint}
      <HelpTip topic={helpTipText.intake.dyeRun.topic}>
        <div className="grid gap-2">
          <p className="m-0">{helpTipText.intake.dyeRun.words}</p>
          <p className="m-0">{helpTipText.intake.dyeRun.fading}</p>
          <p className="m-0">{helpTipText.intake.dyeRun.caution}</p>
        </div>
      </HelpTip>
    </div>
  </div>
}

const identityFields = [
  ['styleNumber', addClothesText.identity.styleNumber, 80],
  ['rnNumber', addClothesText.identity.rnNumber, 40],
  ['barcode', addClothesText.identity.barcode, 80],
] as const satisfies ReadonlyArray<readonly [keyof IdentityDraft, string, number]>

export function sizeExample(kind: GarmentKind | null, article: string | null | undefined): string {
  if (article === 'Bra' || article === 'Sports bra') return 'e.g. 34DD'
  if (kind === 'pants' || kind === 'shorts') return 'e.g. 32 × 30'
  if (kind === 'suit') return 'e.g. 40R'
  if (kind === 'baby_bodysuit') return 'e.g. 6–9 months'
  if (kind === 'sheets') return 'e.g. Queen'
  if (kind === 'towel') return 'e.g. 70 × 140 cm'
  if (kind === 'other') return 'Size or dimensions on the label'
  return 'e.g. M'
}

function GarmentIdentity({ draft, onChange, quantity }: { draft: AddDraft; onChange: (patch: Partial<AddDraft>) => void; quantity?: ReactNode }) {
  const id = useId()
  const { identity } = draft
  return <div className="grid min-w-0 gap-3">
    <div className={cn('grid min-w-0 gap-3', quantity === undefined ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [@container_(width_<_16rem)]:grid-cols-1')}>
      {quantity}
      <Field>
        <FieldLabel htmlFor={`${id}-size`}>{addClothesText.identity.size}</FieldLabel>
        <Input id={`${id}-size`} name="size" value={identity.size} maxLength={40} autoComplete="off" placeholder="Not specified" aria-describedby={`${id}-size-hint`} onChange={(event) => onChange({ identity: { ...identity, size: event.target.value } })} />
        <FieldDescription id={`${id}-size-hint`}>{sizeExample(draft.kind, draft.article)}</FieldDescription>
      </Field>
    </div>
    <Field>
      <FieldLabel htmlFor={`${id}-brand`}>{addClothesText.identity.brand}</FieldLabel>
      <Input id={`${id}-brand`} name="brand" value={identity.brand} maxLength={80} placeholder="Optional" autoComplete="off" onChange={(event) => onChange({ identity: { ...identity, brand: event.target.value } })} />
    </Field>
  </div>
}

/** Personal tags and item identity are optional; type never preselects tags. */
function MoreDetails({ draft, onChange, knownTags }: {
  draft: AddDraft
  onChange: (patch: Partial<AddDraft>) => void
  knownTags: readonly string[]
}) {
  const id = useId()
  return <>
    <ClothingTagsEditor kind={draft.kind} values={draft.tags ?? []} knownTags={knownTags} onChange={(tags) => onChange({ tags })} />
    <MoreSection title={addGarmentText.moreDetails}>
      {identityFields.map(([key, label, max]) => (
        <Field key={key} className={fieldClassName}>
          <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
          <Input id={`${id}-${key}`} value={draft.identity[key]} maxLength={max} autoComplete="off" onChange={(event) => onChange({ identity: { ...draft.identity, [key]: event.target.value } })} />
        </Field>
      ))}
    </MoreSection>
  </>
}

/** The control for a tapped record row: a field, or the chosen tile in a group (else its first). */
function editFieldControl(id: string, field: EditField): HTMLElement | null {
  const byId = (suffix: string) => document.getElementById(`${id}-${suffix}`)
  const chosen = (group: HTMLElement | null) => group?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-checked="true"]') ?? group?.querySelector<HTMLElement>('button') ?? null
  switch (field) {
    case 'name': return byId('name')
    case 'whose': return byId('owner')
    case 'kind': return chosen(byId('kind'))
    case 'color': return byId('colour')
    case 'dyeRun': return chosen(byId('dye-run'))
    case 'material': return chosen(byId('material'))
    case 'quantity': return byId('quantity')
    case 'brand': return byId('brand-size')?.querySelector('input[name=brand]') ?? null
    case 'size': return byId('brand-size')?.querySelector('input[name=size]') ?? null
    case 'reference': return byId(identityFields[0]![0])
  }
}

/** A tapped fact opens its own controls; the general edit keeps all garment details available. */
export function EditClothesSheet({ editing, wearers, calls, onClose, onSaved, renderPhotos, renderSettings, careOnly, focusField, knownTags = [] }: {
  editing: readonly Editable[]
  wearers: readonly AddWearer[]
  calls: AddCalls
  knownTags?: readonly string[]
  onClose: () => void
  onSaved: (saved: AddSaved) => void
  renderPhotos: (textileId: string) => ReactNode
  renderSettings?: (section: 'care' | 'more', disabled: boolean) => ReactNode
  careOnly?: 'all' | 'more'
  /** The record row that was tapped: its control is focused, and its section opened. */
  focusField?: EditField
}) {
  const [before] = useState(() => draftFromGarment(editing[0]!))
  const [draft, setDraft] = useState(before)
  const [removeCareCount, setRemoveCareCount] = useState(0)
  const [quantity, setQuantity] = useState(editing.length)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState('details')
  const [initialPrivate] = useState(() => editing.every((piece) => piece.private === true))
  const [privateItem, setPrivateItem] = useState(initialPrivate)
  const id = useId()
  const set = (patch: Partial<AddDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const selectedWearer = wearerIdOf(draft.whose)
  const minimumQuantity = editing.some((garment) => garment.inLoad !== null || garment.status === 'hanging' || garment.status === 'at_cleaner') ? editing.length : 0
  const waiting = editing.slice(0, quantity).filter((garment) => garment.inLoad === null && ['dirty', 'needs_refresh', 'needs_dry_clean'].includes(garment.status))
  const dirty = privateItem !== initialPrivate || editDirty(before, draft, { quantity, pieces: editing.length, removeCareCount, careOnly: careOnly !== undefined })
  const extrasOnly = careOnly === 'more' && tagComplete(before.tag)
  // The types intake offers, plus this garment's own type when intake would hide it (a bodysuit with no baby).
  const offered = intakeKinds(wearers)
  const kinds = before.kind === null || offered.includes(before.kind) ? offered : [...offered, before.kind]
  const focusOnOpen = focusField === undefined ? undefined : () => editFieldControl(id, focusField)
  const titles: Record<EditField, string> = { name: addClothesText.name, whose: addClothesText.belongsTo, kind: addGarmentText.clothingType, color: addClothesText.color, dyeRun: 'Dye', material: 'Fabric', quantity: addClothesText.quantity, brand: 'Brand and size', size: 'Brand and size', reference: addClothesText.wearAndItemDetails }
  if (careOnly) return <Sheet title={extrasOnly ? addGarmentText.moreOnLabel : 'Check the care label'} subtitle={`${editing[0]!.name} · ${editing.length} ${editing.length === 1 ? 'item' : 'matching items'}`} onClose={onClose} tall compactActions dirty={dirty} busy={pending} initialFocus={focusOnOpen} footer={<><Button disabled={pending || !tagComplete(draft.tag)} onClick={async () => {
    const answers = tagAnswers(draft.tag)
    if (answers === null || pending) return
    setPending(true); setError(null)
    try {
      await calls.answerTagQuestions({ textileIds: editing.map((garment) => garment.textileId as Id<'textiles'>), ...answers })
      onSaved({ textileIds: [], name: editing[0]!.name, photoFailed: false })
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setPending(false) }
  }}>{pending ? 'Saving…' : 'Save label answers'}</Button></>}>
    <p className={mutedClassName}>Copy the label. Apply these answers only to matching items with the same label.</p>
    <TagStep material={draft.material} value={draft.tag} onChange={(tag) => set({ tag })} only={extrasOnly ? 'more' : undefined} />
    {renderPhotos(editing[0]!.textileId)}
    {error === null ? null : <p className={cn(noticeClassName, badClassName)} role="alert">{error}</p>}
  </Sheet>
  const save = async () => {
    if (!draft.name?.trim()) return
    if (fabricProblem(draft.material) !== null) { setTab('fabric'); setError(fabricProblem(draft.material)); return }
    if (!same(draft.tag, before.tag) && !tagComplete(draft.tag)) { setTab('care'); setError(addClothesText.finishCareLabel); return }
    setPending(true)
    setError(null)
    try {
      const writes = editArgs(editing.map((garment) => garment.textileId), before, draft)
      for (const update of writes.updates) await calls.updateTextile(update)
      if (writes.tag !== null) await calls.answerTagQuestions(writes.tag)
      if (writes.material !== null) await calls.setMaterial(writes.material)
      if (privateItem !== initialPrivate && calls.setPrivacy !== undefined && editing.every((piece) => piece.canChangePrivacy === true)) await calls.setPrivacy({ textileIds: editing.map((piece) => piece.textileId as Id<'textiles'>), private: privateItem })
      const careReturned = removeCareCount === 0 ? 0 : (await calls.clearCare({ textileIds: waiting.slice(0, removeCareCount).map((garment) => garment.textileId as Id<'textiles'>) })).changed
      const addedMatching = Math.max(0, quantity - editing.length)
      const movedToTrash = Math.max(0, editing.length - quantity)
      if (addedMatching > 0) await calls.addMatchingTextiles({ textileId: editing[0]!.textileId as Id<'textiles'>, quantity: addedMatching })
      if (movedToTrash > 0) await calls.trashTextiles({ textileIds: editing.slice(quantity).map((garment) => garment.textileId as Id<'textiles'>) })
      onSaved({ textileIds: [], name: garmentName(draft), photoFailed: false, careReturned, addedMatching, movedToTrash })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  const fields = (section: string) => {
    const shows = (field: EditField) => focusField !== undefined ? focusField === field : section === (field === 'material' ? 'fabric' : field === 'dyeRun' ? 'care' : field === 'reference' ? 'more' : 'details')
    return <div className={editClothesFieldsClassName}>
      {shows('name') ? <Field className={fieldClassName}><FieldLabel htmlFor={`${id}-name`}>{addClothesText.name}</FieldLabel><Input id={`${id}-name`} value={draft.name ?? ''} maxLength={80} onChange={(event) => set({ name: event.target.value })} /></Field> : null}
      {shows('whose') ? <Field className={fieldClassName}><FieldLabel htmlFor={`${id}-owner`}>{addClothesText.belongsTo}</FieldLabel><NativeSelect id={`${id}-owner`} value={selectedWearer ?? 'shared'} onChange={(event) => set({ whose: event.target.value === 'shared' ? 'shared' : { wearerId: event.target.value } })}><option value="shared">{addClothesText.sharedItem}</option>{wearers.map((wearer) => <option key={wearer.wearerId} value={wearer.wearerId}>{wearer.name}</option>)}</NativeSelect></Field> : null}
      {shows('kind') ? <MoreSection variant="section" title={addGarmentText.clothingType}>
        <div id={`${id}-kind`}>
          <p id={`${id}-kind-title`} className={visuallyHiddenClassName}>{addGarmentText.clothingType}</p>
          {/* Only the type changes here: a picked article never renames the garment. */}
          <GarmentTypePicker labelledBy={`${id}-kind-title`} kinds={kinds} value={draft.kind} onPick={(pick) => set({ kind: pick.kind })} />
        </div>
      </MoreSection> : null}
      {shows('color') ? <><Field className={fieldClassName}><FieldLabel htmlFor={`${id}-colour`}>{addClothesText.color}</FieldLabel><NativeSelect id={`${id}-colour`} value={draft.colour ?? ''} onChange={(event) => set({ colour: event.target.value as ColourChoice, colorName: '' })}><option value="">{addClothesText.notSet}</option>{colourChoices.map((colour) => <option key={colour} value={colour}>{colourWords[colour]}</option>)}</NativeSelect></Field>
      <Field className={fieldClassName}><FieldLabel htmlFor={`${id}-exact-color`}>{addClothesText.exactColor}</FieldLabel><Input id={`${id}-exact-color`} value={draft.colorName} maxLength={60} onChange={(event) => set({ colorName: event.target.value })} /></Field></> : null}
      {shows('dyeRun') ? <div id={`${id}-dye-run`}><DyeRunChoices value={draft.dyeRun} onChange={(dyeRun) => set({ dyeRun })} /></div> : null}
      {shows('material') ? <div id={`${id}-material`}><FabricChoices editing value={draft.material} details={draft.fabricDetails} onDetails={(fabricDetails) => set({ fabricDetails })} onChange={(material) => set({ material, fabricDetails: detailsForMaterial(material, draft.fabricDetails) })} /></div> : null}
      <div className={editClothesExtraClassName}>
        {editing[0]?.guest || !shows('quantity') ? null : <MoreSection variant="section" title={addClothesText.quantity}>
            <Field className={cn(fieldClassName, editClothesQuantityClassName)}><FieldLabel htmlFor={`${id}-quantity`}>{addClothesText.matchingPieces(editing.length)}</FieldLabel><Input id={`${id}-quantity`} type="number" inputMode="numeric" min={minimumQuantity} max={editing.length + 20} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(minimumQuantity, Math.min(editing.length + 20, Math.trunc(Number(event.target.value) || 0))))} /></Field>
            <p className={mutedClassName}>{minimumQuantity === 0 ? addClothesText.quantityHint : addClothesText.finishCareBeforeRemoving}</p>
          </MoreSection>}
        {waiting.length === 0 || focusField !== undefined || section !== 'care' ? null : <MoreSection variant="section" title={addClothesText.careStatus}>
            {waiting.length === 1 ? <label className={editCareToggleClassName}><Checkbox checked={removeCareCount === 1} onCheckedChange={(checked) => setRemoveCareCount(checked === true ? 1 : 0)} />{addClothesText.removeCare}</label>
              : <Stepper label={addClothesText.removeCare} value={removeCareCount} min={0} max={waiting.length} onChange={setRemoveCareCount} format={(count) => addClothesText.ofMatching(count, waiting.length)} />}
            <p className={mutedClassName}>{addClothesText.removeCareHint}</p>
          </MoreSection>}
        {shows('brand') || shows('size') ? <div id={`${id}-brand-size`}><GarmentIdentity draft={draft} onChange={set} /></div> : null}
        {focusField === undefined && section === 'details' ? <ClothingTagsEditor kind={draft.kind} values={draft.tags ?? []} knownTags={knownTags} onChange={(tags) => set({ tags })} /> : null}
        {shows('reference') ? <MoreSection variant="section" title={addClothesText.wearAndItemDetails}>
            <div className={editClothesIdentityClassName}>{identityFields.map(([key, label, max]) => <Field key={key} className={fieldClassName}><FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel><Input id={`${id}-${key}`} value={draft.identity[key]} maxLength={max} onChange={(event) => set({ identity: { ...draft.identity, [key]: event.target.value } })} /></Field>)}</div>
          </MoreSection> : null}
      </div>
      {focusField === undefined && section === 'care' ? <><TagStep material={draft.material} value={draft.tag} onChange={(tag) => set({ tag })} />{renderPhotos(editing[0]!.textileId)}</> : null}
      {focusField === undefined && section === 'more' ? <GarmentPrivacy on={privateItem} onChange={setPrivateItem} disabled={pending || calls.setPrivacy === undefined || !editing.every((piece) => piece.canChangePrivacy === true)} /> : null}
      {focusField === undefined && (section === 'care' || section === 'more') ? renderSettings?.(section, pending || dirty) : null}
    </div>
  }
  return <Sheet title={focusField === undefined ? editing.length === 1 ? addClothesText.clothingDetails : addClothesText.matchingPieces(editing.length) : titles[focusField]} onClose={onClose} closeLabel={addClothesText.cancel} tall compactActions dirty={dirty} busy={pending} initialFocus={focusOnOpen}
    footer={<>{error === null ? null : <p className={cn(noticeClassName, badClassName, 'order-first')} role="alert">{error}</p>}<Button type="button" className={largeClassName} disabled={pending || !draft.name?.trim() || fabricProblem(draft.material) !== null} onClick={() => void save()}>{addClothesText.saveChanges}</Button></>}>
    {editing.length > 1 ? <p className={mutedClassName}>{addClothesText.changesApply(editing.length)}</p> : null}
    <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0">
      {focusField !== undefined ? fields('details') : <Tabs value={tab} onValueChange={(value) => { if (!pending && value !== null) setTab(String(value)) }}>
        <TabsList aria-label="Item editor sections">{['details', 'fabric', 'care', 'more'].map((section) => <TabsTrigger key={section} value={section} disabled={pending}>{section === 'details' ? 'Details' : section === 'fabric' ? 'Fabric' : section === 'care' ? 'Care' : 'More'}</TabsTrigger>)}</TabsList>
        {['details', 'fabric', 'care', 'more'].map((section) => <TabsContent key={section} value={section} keepMounted>{fields(section)}</TabsContent>)}
      </Tabs>}
    </fieldset>
  </Sheet>
}

/** "Add a photo of the tag": kept on this device until Save, then stored with the garment. */
function TagPhoto({ photo, onPhoto }: { photo: File | null; onPhoto: (file: File | null) => void }) {
  return photo === null ? (
    <label className={cn(secondaryButtonClassName, fileButtonClassName)}>
      {addClothesText.addTagPhoto}
      <Input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file !== undefined) onPhoto(file)
      }} />
    </label>
  ) : (
    <p className={tagPhotoChosenClassName}>
      <span>{addClothesText.tagPhotoAdded}</span>
      <Button variant="unstyled" size="unstyled" type="button" className={secondaryButtonClassName} onClick={() => onPhoto(null)}>{addClothesText.remove}</Button>
    </p>
  )
}

// ---- With its data -------------------------------------------------------------------

/** How an edit ended: every piece moved to trash, so the record it was opened from has nothing left to show. */
export type EditOutcome = { readonly removedAll: boolean }

/** The intake or edit form with live household data and a confirmation after saving. */
export function AddClothesFlow({ householdId, mode, firstRun = false, onClose }: { householdId: string; mode: AddMode; firstRun?: boolean; onClose: (outcome?: EditOutcome) => void }) {
  const inventory = useQuery(api.inventory.list, { householdId: householdId as Id<'households'> })
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl)
  const attach = useAction(api.photos.attach)
  const calls: AddCalls = {
    createTextiles: useMutation(api.inventory.createTextiles),
    addMatchingTextiles: useMutation(api.inventory.addMatchingTextiles),
    trashTextiles: useMutation(api.inventory.trashTextiles),
    createWearer: useMutation(api.inventory.createWearer),
    updateTextile: useMutation(api.inventory.updateTextile),
    answerTagQuestions: useMutation(api.inventory.answerTagQuestions),
    setMaterial: useMutation(api.inventory.setMaterial),
    setPrivacy: useMutation(api.inventory.setPrivacy),
    clearCare: useMutation(api.closet.unflag),
    uploadPhoto: (textileId, file) => uploadCarePhoto({ generateUploadUrl, attach }, textileId, file),
  }
  if (inventory === undefined) return null
  const editing = mode.kind === 'edit' ? inventory.textiles.filter((textile) => mode.textileIds.includes(textile.textileId)) : []
  if (mode.kind === 'edit') {
    if (editing.length === 0) return null
    return <EditClothesSheet editing={editing} wearers={inventory.wearers} calls={calls} onClose={onClose} careOnly={mode.careOnly} focusField={mode.focusField} knownTags={usedClothingTags(inventory.textiles)}
      renderPhotos={(textileId) => <CarePhotos textileId={textileId as Id<'textiles'>} />}
      renderSettings={(section, disabled) => <GarmentSettings textiles={editing} section={section} disabled={disabled} />}
      onSaved={(saved) => {
        toast.success([saved.careReturned ? addClothesText.careReturned(saved.careReturned) : '', saved.addedMatching ? addClothesText.matchingAdded(saved.addedMatching) : '', saved.movedToTrash ? addClothesText.movedToTrash(saved.movedToTrash) : ''].filter(Boolean).join(' ') || addClothesText.saved)
        onClose({ removedAll: (saved.movedToTrash ?? 0) > 0 && (saved.movedToTrash ?? 0) >= editing.length })
      }} />
  }
  return <AddClothesSheet householdId={householdId} mode={mode} wearers={inventory.wearers} calls={calls} firstRun={firstRun} emptyCloset={inventory.textiles.length === 0} onClose={onClose} knownTags={usedClothingTags(inventory.textiles)}
    onSaved={(saved) => {
      toast.success(savedToast(saved, mode.target))
      onClose()
    }} />
}

export function GarmentSettings({ textiles, section, disabled }: { textiles: readonly Textile[]; section: 'care' | 'more'; disabled: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const instructions = factGroups(textiles, (piece) => piece.care?.instructions ?? null, (piece) => `Label notes for ${piece.name}`)
  return <div className="grid min-w-0 gap-4">
    {disabled ? <p className={mutedClassName}>Save your changes before opening another editor.</p> : null}
    <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-4 border-0 p-0">
      {section === 'more' ? <>
        {factGroups(textiles, (piece) => piece.catalogBinding ?? null, (piece) => piece.name).map(({ key, first: piece, label }) => <div key={key} className="grid gap-2">{label === undefined ? null : <p className="m-0">{label}</p>}<CatalogReference holding={{ kind: 'garment', id: piece.textileId }} binding={piece.catalogBinding} name={piece.name} disabled={disabled} /></div>)}
        {textiles.every((piece) => !piece.guest) ? <GarmentPrintDetails textiles={textiles} expanded /> : null}
      </> : <ActionList label="Other care settings" chevrons actions={[
        ...(textiles.some((piece) => !piece.guest) ? [{ key: 'routine', label: 'Wash & dry preferences', onClick: () => setOpen('routine') }] : []),
        ...instructions.flatMap(({ key, first: piece, label }) => piece.care === null ? [] : [{ key, label: 'Label notes', hint: label, onClick: () => setOpen(key) }]),
      ]} />}
    </fieldset>
    {section === 'care' ? <>
      <PersonalRoutine textiles={textiles} open={open === 'routine'} onClose={() => setOpen(null)} />
      {instructions.map(({ key, first: piece, label }) => <CareInstructions key={key} textile={piece} pieceLabel={label} open={open === key} onClose={() => setOpen(null)} />)}
    </> : null}
  </div>
}

/**
 * The design's named colours. Each name is the garment's recorded colour and sets the colour group the
 * planner sorts by; "Mixed" and "Not sure" sort as unknown, so they are washed cautiously. A name is
 * only the colour you picked: it never sets a care fact.
 */
export const namedColours: readonly { readonly name: string; readonly group: ColourChoice; readonly fill: string; readonly hint?: string; readonly unnamed?: boolean }[] = [
  { name: 'White', group: 'white', fill: '#ffffff', hint: 'White and off-white.' },
  { name: 'Cream', group: 'light', fill: '#f2ead6', hint: 'Cream, a pale warm neutral.' },
  { name: 'Gray', group: 'medium', fill: '#9a9a96' },
  { name: 'Black', group: 'black', fill: '#1d1d1d', hint: 'Black and faded black.' },
  { name: 'Navy', group: 'dark', fill: '#1f2a4e', hint: 'Navy, a dark blue.' },
  { name: 'Blue', group: 'medium', fill: '#3a64c8' },
  { name: 'Red', group: 'saturated', fill: '#c8485a' },
  { name: 'Pink', group: 'light', fill: '#e7a3b4' },
  { name: 'Green', group: 'medium', fill: '#6f8669' },
  { name: 'Brown', group: 'dark', fill: '#8a6a4a' },
  { name: 'Mixed', group: 'unknown', fill: 'conic-gradient(#c8485a 0 25%, #3a64c8 0 50%, #6f8669 0 75%, #f2ead6 0)' },
  { name: 'Not sure', group: 'unknown', fill: 'transparent', unnamed: true },
]

const colourShades: Readonly<Record<string, Readonly<Record<'light' | 'medium' | 'dark', { fill: string; hint: string }>>>> = {
  Gray: {
    light: { fill: '#d8d8d4', hint: 'Light gray, such as silver.' },
    medium: { fill: '#9a9a96', hint: 'Medium gray, such as stone.' },
    dark: { fill: '#4a4d52', hint: 'Dark gray, such as charcoal.' },
  },
  Blue: {
    light: { fill: '#adc7eb', hint: 'Light blue, such as powder blue.' },
    medium: { fill: '#3a64c8', hint: 'Medium blue, such as royal blue.' },
    dark: { fill: '#273f75', hint: 'Dark blue, such as indigo.' },
  },
  Red: {
    light: { fill: '#ed9a9c', hint: 'Light red, such as coral.' },
    medium: { fill: '#c8485a', hint: 'Medium red, such as cherry red.' },
    dark: { fill: '#6e1f2e', hint: 'Dark red, such as burgundy.' },
  },
  Pink: {
    light: { fill: '#e7a3b4', hint: 'Light pink, such as blush.' },
    medium: { fill: '#d96994', hint: 'Medium pink, such as rose pink.' },
    dark: { fill: '#9b3359', hint: 'Dark pink, such as deep rose.' },
  },
  Green: {
    light: { fill: '#b9ccb1', hint: 'Light green, such as pale sage.' },
    medium: { fill: '#6f8669', hint: 'Medium green, such as leaf green.' },
    dark: { fill: '#324f3b', hint: 'Dark green, such as forest green.' },
  },
  Brown: {
    light: { fill: '#c9b18a', hint: 'Light brown, such as tan.' },
    medium: { fill: '#8a6a4a', hint: 'Medium brown, such as caramel.' },
    dark: { fill: '#503727', hint: 'Dark brown, such as chocolate.' },
  },
}

/** Specific recorded colour words can retain their base swatch; no care fact is inferred. */
function namedColourName(value: string): string | null {
  // Older garments recorded the swatch as "Grey"; it is the same Gray swatch.
  const word = colorText(value).toLowerCase()
  if (word === 'indigo') return 'Blue'
  return namedColours.find((entry) => entry.name.toLowerCase() === word)?.name ?? null
}

export function NamedColourGrid({ value, group, onPick }: { value: string; group: ColourChoice | null; onPick: (name: string, colour: ColourChoice) => void }) {
  const name = namedColourName(value)
  const chosen = namedColours.find((entry) => (entry.unnamed === true ? value === '' && group === 'unknown' : entry.name === name)) ?? null
  // Medium red remains Bright for laundry sorting; shade is only its visible depth.
  const shade = group === 'saturated' ? 'medium' : group
  const sample = chosen === null || (shade !== 'light' && shade !== 'medium' && shade !== 'dark') ? null : colourShades[chosen.name]?.[shade]
  const hint = group === 'unknown' ? null : sample?.hint ?? chosen?.hint
  return (
    <div className={colourStepClassName}>
      <p className={colourHintClassName}>{colourHint}</p>
      <div className="grid grid-cols-4 gap-x-2 gap-y-3" role="radiogroup" aria-label={colourQuestion}>
        {namedColours.map((entry) => <Swatch key={entry.name} label={entry.name} fill={chosen?.name === entry.name ? sample?.fill ?? entry.fill : entry.fill} chosen={chosen?.name === entry.name} onPick={() => onPick(entry.unnamed === true ? '' : entry.name, entry.group)} />)}
      </div>
      {hint == null ? null : <p className={colourHintClassName} role="status">{hint}</p>}
    </div>
  )
}
