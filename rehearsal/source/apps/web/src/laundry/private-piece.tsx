import type { PrivateCare } from '@convex/access'
import { cycleWord } from '@/copy'
import { privatePieceText } from '@/copy-load'
import { RecordRow } from '@/kit/record-row'

export type PrivatePiece = { textileId: string; private?: boolean; privateCare?: PrivateCare | null }

export function privateCareWords(care: PrivateCare | null | undefined): string {
  if (care == null) return privatePieceText.unknown
  const method = { machine: privatePieceText.machine, hand_wash: privatePieceText.hand, dry_clean_only: privatePieceText.cleaner, do_not_wash: privatePieceText.noWash, unknown: privatePieceText.unknown }[care.washMethod]
  const drying = { line_dry: privatePieceText.hang, drip_dry: privatePieceText.drip, dry_flat: privatePieceText.flat, do_not_tumble_dry: privatePieceText.noTumble, tumble_dry: privatePieceText.tumble, unknown: '' }[care.dryMethod]
  return [...new Set([method, care.maxTemperatureC === null ? '' : privatePieceText.maximum(care.maxTemperatureC), cycleWord(care.cycle) ?? '',
    care.bleach === 'none' ? privatePieceText.noBleach : care.bleach === 'non_chlorine' ? privatePieceText.oxygenOnly : '',
    drying, care.dryMethod === 'tumble_dry' && care.dryHeat != null ? privatePieceText.heat[care.dryHeat] : '', ...care.restrictions, ...care.lines].filter(Boolean))].join(' · ')
}

/** Identical instructions count together; different care always gets its own row. */
export function privatePieceGroups(pieces: readonly PrivatePiece[]) {
  const groups = new Map<string, { ids: string[]; care: string }>()
  for (const piece of pieces) {
    const care = privateCareWords(piece.privateCare)
    const group = groups.get(care)
    if (group === undefined) groups.set(care, { ids: [piece.textileId], care })
    else group.ids.push(piece.textileId)
  }
  return [...groups.values()]
}

export function PrivatePieceRows({ pieces }: { pieces: readonly PrivatePiece[] }) {
  return <>{privatePieceGroups(pieces).map((group) => <RecordRow key={group.ids[0]} title={privatePieceText.pieces(group.ids.length)} fact={group.care} />)}</>
}
