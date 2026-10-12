import { sourceIssueText } from '@/copy'
import { FlagSheet, draftFromFlag, type FlagCall } from '@/closet/flag-sheet'
import { attemptName, type Textile } from '@/household/inventory-types'

/** Keep the flag's original scheduling, soil and unchanged prior-treatment evidence. */
export function stainInspectionArgs(textile: Pick<Textile, 'flag' | 'soilLevel'>, args: Parameters<FlagCall>[0]): Parameters<FlagCall>[0] {
  const attempts = textile.flag?.stainReport?.priorTreatmentAttempts
  const displayedAttempts = Array.isArray(attempts) ? attempts.length === 0 ? [] : [attempts.map(attemptName).join(', ')] : 'unknown'
  const unchanged = JSON.stringify(args.stainReport?.priorTreatmentAttempts) === JSON.stringify(displayedAttempts)
  return { ...args,
    stainOnly: true,
    reasons: textile.flag?.reasons ?? args.reasons,
    soilLevel: textile.soilLevel ?? args.soilLevel,
    ...(textile.flag?.neededBy === undefined ? {} : { neededBy: textile.flag.neededBy }),
    ...(args.stainReport === undefined || !unchanged || attempts === undefined ? {} : { stainReport: { ...args.stainReport, priorTreatmentAttempts: attempts } }),
  }
}

export function StainInspectionSheet({ textile, now, flag, onClose, onSaved }: {
  textile: Textile
  now: number
  flag: FlagCall
  onClose: () => void
  onSaved: () => void
}) {
  return <FlagSheet
    garments={[{ textileId: textile.textileId, name: textile.name, dryCleanOnly: false }]}
    now={now}
    initial={draftFromFlag(textile.flag, textile.soilLevel, now)}
    start="stain"
    stainOnly
    saveLabel={sourceIssueText.saveStainShort}
    saveAriaLabel={sourceIssueText.saveStain}
    flag={async (args) => {
      const result = await flag(stainInspectionArgs(textile, args))
      if (result.changed === 0) throw new Error('This piece could not be updated. Review the current load and try again.')
      return result
    }}
    onClose={onClose}
    onDone={onSaved}
  />
}
