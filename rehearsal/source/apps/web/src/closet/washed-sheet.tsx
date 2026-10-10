import { cn } from '@/lib/utils'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useState } from 'react'

import type { api } from '@/api'
import { countWord, washedText } from '@/copy'
import { Sheet } from '@/kit/sheet'
import { errorMessage } from '@/kit/ui'
import { AnswerRow } from '@/laundry/laundry-ui'
import { DesignIcon } from '@/kit/design-icons'

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

export type WashedCall = (args: FunctionArgs<typeof api.closet.washedElsewhere>) => Promise<FunctionReturnType<typeof api.closet.washedElsewhere>>

/** "{Name} is back in the closet.", or how many are. */
export function backInClosetToast(names: readonly string[], changed: number): string | null {
  if (changed === 0) return null
  return changed === 1 && names.length === 1 ? washedText.backOne(names[0]!) : washedText.backMany(changed)
}

/** "Washed it another way": by hand or somewhere else. It counts as a wash. */
export function WashedSheet({ garments, washed, onClose, onDone }: {
  garments: readonly { readonly textileId: string; readonly name: string }[]
  washed: WashedCall
  onClose: () => void
  onDone: (message: string | null) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = async (method: 'hand' | 'elsewhere') => {
    setPending(true)
    setError(null)
    try {
      const result = await washed({ textileIds: garments.map((garment) => garment.textileId) as FunctionArgs<typeof api.closet.washedElsewhere>['textileIds'], method })
      onDone(backInClosetToast(garments.map((garment) => garment.name), result.changed))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }
  return (
    <Sheet title={washedText.title} subtitle={garments.length === 1 ? garments[0]!.name : countWord(garments.length, 'laundry item')} onClose={onClose} closeLabel={washedText.cancel} compactActions
      footer={error === null ? undefined : <p className={cn(noticeClassName, badClassName)} role="alert">{error}</p>}>
      <AnswerRow label={washedText.title} disabled={pending} answers={[
        { key: 'hand', label: washedText.hand, icon: <DesignIcon name="hand" size={22} strokeWidth={1.6} />, onClick: () => void pick('hand') },
        { key: 'elsewhere', label: washedText.elsewhere, icon: <DesignIcon name="washer" size={22} strokeWidth={1.6} />, onClick: () => void pick('elsewhere') },
      ]} />
    </Sheet>
  )
}
