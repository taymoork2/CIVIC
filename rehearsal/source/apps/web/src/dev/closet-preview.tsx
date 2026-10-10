import { useState } from 'react'
import type { Id } from '@convex/_generated/dataModel'
import { AddClothesSheet, EditClothesSheet, GarmentSettings, emptyAddDraft, type AddCalls } from '@/closet/add-clothes'
import { ClosetView, type ClosetCalls, type Today } from '@/closet/closet-view'
import { CareQuestionSheet } from '@/closet/garment-care'
import { GarmentRecordView, type GarmentRecord } from '@/closet/garment-record'
import { GarmentSheet } from '@/closet/garment-sheet'
import type { Care, Inventory, Textile } from '@/household/inventory-types'
import { TagsSheet } from '@/closet/tags-sheet'
import { emptyTag } from '@/laundry/tag-step'
import { previewCall, previewUnavailable, previewUnavailableCalls } from '@/dev/preview-calls'
import { FixtureConvex } from '@/dev/fixture-preview'

const now = Date.UTC(2026, 9, 2, 19)
// Every write dependency rejects locally: no fixture ID can reach the backend.
const calls: ClosetCalls = previewUnavailableCalls({
  flagDirty: 'mark it dirty', setRefresh: 'set it to refresh', unflag: 'take it out of the hamper', refreshed: 'mark it refreshed',
  pickedUp: 'mark it picked up', allDry: 'mark it dry', droppedAtCleaner: 'record the cleaner drop-off', washedElsewhere: 'record a wash elsewhere',
  updateTags: 'save its tags', answerCare: 'save the care answer',
  answerStainCheck: 'save the stain answer', resolveStain: 'save what happens to the stain', retire: 'retire the pieces',
})
const addCalls: AddCalls = previewUnavailableCalls({
  createTextiles: 'add the clothes', addMatchingTextiles: 'add matching pieces', trashTextiles: 'remove the clothes', createWearer: 'add a person',
  updateTextile: 'save the edit', answerTagQuestions: 'save the tag answers', setMaterial: 'save the fabric', setPrivacy: 'save visibility', clearCare: 'clear the care tag', uploadPhoto: 'upload the photo',
})
const wearers: Inventory['wearers'] = [
  { wearerId: 'preview-alex' as Id<'wearers'>, name: 'Alex', kind: 'adult', principalKey: 'preview-user' },
  { wearerId: 'preview-sam' as Id<'wearers'>, name: 'Sam', kind: 'adult', principalKey: null },
  { wearerId: 'preview-mia' as Id<'wearers'>, name: 'Mia', kind: 'child', principalKey: null },
]
const recordedCare: Care = { material: null, washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, bleach: 'none', restrictions: [], dryMethod: 'tumble_dry', dryMethodInferred: false, dryHeat: 'low', ironSteam: null, status: 'confirmed', provenance: { source: 'Frozen visual fixture only', confidence: 'user-supplied' } }
type Group = { key: string; name: string; kind: Textile['kind']; color: string; colorGroup: Textile['colorGroup']; owner: number | null; count: number; ready: number; tags: string[]; care: Care | null }
const groups: Group[] = [
  { key: 'tee', name: 'White cotton tee', kind: 't_shirt', color: 'White', colorGroup: 'white', owner: 0, count: 3, ready: 1, tags: ['Everyday'], care: recordedCare },
  { key: 'navy', name: 'Navy everyday tee', kind: 't_shirt', color: 'Navy', colorGroup: 'dark', owner: 0, count: 2, ready: 2, tags: ['Everyday'], care: recordedCare },
  { key: 'towel', name: 'Gray bath towel', kind: 'towel', color: 'Gray', colorGroup: 'light', owner: null, count: 4, ready: 0, tags: ['Home'], care: { ...recordedCare, maxTemperatureC: 40, bleach: 'any', dryHeat: null } },
  { key: 'jeans', name: 'Indigo jeans', kind: 'pants', color: 'Indigo', colorGroup: 'dark', owner: 0, count: 2, ready: 1, tags: ['Everyday', 'Work'], care: { ...recordedCare, maxTemperatureC: null, dryMethod: 'do_not_tumble_dry', dryHeat: null, restrictions: ['Do not tumble dry'] } },
  { key: 'leggings', name: 'Black leggings', kind: 'pants', color: 'Black', colorGroup: 'dark', owner: 1, count: 2, ready: 0, tags: ['Sport'], care: { ...recordedCare, bleach: 'non_chlorine', dryMethod: 'do_not_tumble_dry', dryHeat: null, restrictions: ['Do not tumble dry'] } },
  { key: 'pyjamas', name: 'Striped pajamas', kind: 'pajamas', color: 'Pink stripe', colorGroup: 'light', owner: 2, count: 3, ready: 1, tags: ['Sleep'], care: recordedCare },
  { key: 'linen', name: 'Rust linen shirt', kind: 'shirt', color: 'Rust', colorGroup: 'saturated', owner: 0, count: 1, ready: 1, tags: ['Work'], care: null },
]
const textiles: Textile[] = groups.flatMap((group) => Array.from({ length: group.count }, (_, index): Textile => ({
  textileId: `preview-${group.key}-${index}` as Id<'textiles'>, name: group.name, kind: group.kind, color: group.color, colorGroup: group.colorGroup, wearerId: group.owner === null ? null : wearers[group.owner]!.wearerId, occasions: [], tags: group.tags,
  status: index < group.ready ? 'clean' : 'dirty', guest: false, inLoad: null, care: group.care, flag: group.key === 'tee' && index >= group.ready ? { reasons: ['food'], flaggedBy: 'preview-user', flaggedAt: now } : null, soilLevel: 'normal', statusSince: now, washCount: 0, firstWash: false, bulkUnits: null, fromFixture: false, lastWornAt: null, wearsSinceClean: 0, lastCleanedAt: null, cleanerNote: null, cleanerPickupBy: null, identity: null, createdAt: now,
})))
const today: Today = { ready: [], readyCount: 6, notReady: { dirty: 11, in_wash: 0, hanging: 0, needs_dry_clean: 0, at_cleaner: 0, needs_refresh: 0 }, notReadyForOccasion: [], notWornDays: 90 }
const record: GarmentRecord = { label: 'tumble_dry', preference: null, equipment: { tumble: true, heated_hanging: false }, washes: [], preferenceChanges: [] }

// A washed food stain on the white tees, dry and back in the closet: unanswered asks "Stain gone?", still there asks "What next?".
const stainCheck = (answer?: 'still_there') => (piece: Textile): Textile => ({ ...piece, status: 'clean', flag: null, care: { ...recordedCare, material: 'cotton' },
  stainCheck: { reason: 'food', kind: 'protein', tried: [], washes: 1, washedAt: now, ...(answer === undefined ? {} : { answer }) } })

export { textiles as reviewTextiles, record as reviewGarmentRecord }

export type ClosetPreviewState = 'index' | 'record' | 'stain-check' | 'stain-next' | 'tags' | 'tags-long' | 'tags-pending' | 'care-question' | 'care-question-pending' | 'care-wash' | 'care-dry' | 'add-type' | 'add-details' | 'add-color' | 'add-care' | 'add-label' | 'add-stains' | 'add-stain-set-in' | 'add-search' | 'first-wash'

/** The real Closet and sheet presenters, supplied only with frozen visual data. */
export function ClosetPreview({ variant }: { variant: ClosetPreviewState }) {
  const [wearer, setWearer] = useState<Parameters<typeof ClosetView>[0]['wearerChip']>('everyone')
  const [opened, setOpened] = useState<string | null>(variant === 'index' || variant === 'first-wash' ? null : variant === 'tags-pending' || variant === 'tags-long' ? 'tags' : variant)
  const members = textiles.filter((piece) => piece.textileId.startsWith(opened === 'tags' ? 'preview-navy-' : 'preview-tee-'))
  const finalStep = opened === 'add-stains' || opened === 'add-stain-set-in'
  const initial = { ...emptyAddDraft, whose: { wearerId: wearers[0]!.wearerId }, name: opened === 'add-color' ? 'Indigo jeans' : 'White cotton tee', kind: opened === 'add-color' ? 'pants' as const : 't_shirt' as const, colour: opened === 'add-color' ? 'dark' as const : 'white' as const, colorName: opened === 'add-color' ? 'Indigo' : 'White', dyeRun: opened === 'add-color' ? 'new' as const : null, tag: opened === 'add-care' || opened === 'add-label' || finalStep ? { ...emptyTag, method: 'machine' as const, dots: 1 as const, bars: 0 as const, ...(opened === 'add-label' || finalStep ? { bleach: 'none' as const, dryer: 'low' as const } : {}) } : emptyTag,
    ...(opened === 'add-details' ? { material: 'cotton' } : {}), ...(opened === 'add-stain-set-in' ? { stain: 'food' as const, stainAge: 'set_in' as const } : {}) }
  const close = () => setOpened(null)
  const openedMembers = opened === 'record' ? members : opened === 'stain-check' || opened === 'stain-next' ? members.map(stainCheck(opened === 'stain-next' ? 'still_there' : undefined)) : textiles.filter((piece) => piece.name === textiles.find((piece) => piece.textileId === opened)?.name)
  const openedWearer = wearers.find((person) => person.wearerId === openedMembers[0]?.wearerId)?.name ?? null
  return <>
    <ClosetView now={now} attention={{ hamper: { count: 11, loads: null, handWash: 0 }, top: null, cards: [] }} today={today} inventory={{ wearers, textiles }} sessions={[]} meWearerId={wearers[0]!.wearerId} wearerChip={wearer} onWearerChip={setWearer} calls={calls}
      onItemOpen={(id) => setOpened(id)} addClothes={(_, onClose) => <AddClothesSheet householdId="preview-household" mode={{ kind: 'add', target: 'closet' }} wearers={wearers} calls={addCalls} onClose={onClose} onSaved={onClose} />} />
    {opened === null ? null : opened === 'tags' ? <TagsSheet name="Navy everyday tee" textileIds={members.map((piece) => piece.textileId)} initial={['Everyday']} knownTags={['Everyday', 'Home', 'Work', 'Sport', 'Sleep', ...(variant === 'tags-long' ? ['AlexandriaMontgomeryFamilyShirts'] : [])]} save={variant === 'tags-pending' ? () => new Promise<never>(() => {}) : previewUnavailable('save the tags')} onClose={close} onSaved={previewCall('close the saved tags')} />
      : opened === 'care-question' || opened === 'care-question-pending' || opened === 'care-wash' || opened === 'care-dry' ? <CareQuestionSheet name="White cotton tee" kicker="White · T-shirt · Alex" question={opened === 'care-wash' ? 'wash' : opened === 'care-dry' ? 'dry' : 'bleach'} members={members} save={opened === 'care-question-pending' ? () => new Promise<never>(() => {}) : previewUnavailable('save the care answer')} onClose={close} onSaved={previewCall('close the saved care answer')} />
      // The first intake's type step: all sixteen tiles under "What needs washing?".
      : opened === 'add-type' ? <AddClothesSheet householdId="preview-household" mode={{ kind: 'add', target: 'hamper' }} wearers={wearers} calls={addCalls} firstRun onClose={close} onSaved={close} />
      // The type step with "sweat" typed: matching articles replace the tiles.
      : opened === 'add-search' ? <AddClothesSheet householdId="preview-household" mode={{ kind: 'add', target: 'hamper' }} wearers={wearers} calls={addCalls} initialQuery="sweat" onClose={close} onSaved={close} />
      : opened === 'add-details' || opened === 'add-color' || opened === 'add-care' || opened === 'add-label' || finalStep ? <AddClothesSheet householdId="preview-household" mode={{ kind: 'add', target: 'closet' }} wearers={wearers} calls={addCalls} initial={initial} initialStep={opened === 'add-details' ? 'details' : opened === 'add-color' ? 'color' : opened === 'add-label' ? 'label' : finalStep ? 'stain' : 'care'} onClose={close} onSaved={close} />
      : <GarmentSheet facts={{ members: openedMembers, wearerName: openedWearer, now, notWornDays: 90, doneAt: null, hangingSessionId: null }} calls={calls} knownTags={['Everyday', 'Work', 'Sport', 'Home', 'Sleep']} renderRecord={(panels) => <GarmentRecordView record={record} {...panels} />} onClose={close} onDone={previewCall('finish with this garment')} onNext={previewCall('open the next garment')}
        renderEdit={(edit, onEditClose) => <EditClothesSheet editing={textiles.filter((piece) => edit.textileIds.includes(piece.textileId))} wearers={wearers} calls={addCalls} careOnly={edit.careOnly} focusField={edit.focusField} renderPhotos={() => null} renderSettings={(section, disabled) => <FixtureConvex data={{}}><GarmentSettings textiles={textiles.filter((piece) => edit.textileIds.includes(piece.textileId))} section={section} disabled={disabled} /></FixtureConvex>} onClose={() => onEditClose()} onSaved={() => onEditClose()} />} />}
  </>
}
