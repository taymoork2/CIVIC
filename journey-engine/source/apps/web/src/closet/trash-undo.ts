import { toast } from 'sonner'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import type { api } from '@/api'
import { errorMessage } from '@/kit/ui'

export type TrashReceipt = { textileIds: FunctionArgs<typeof api.inventory.restoreTextiles>['textileIds']; trashedAt: number; revisions: NonNullable<FunctionArgs<typeof api.inventory.restoreTextiles>['expectedRevisions']> }
export type RestoreTextiles = (args: FunctionArgs<typeof api.inventory.restoreTextiles>) => Promise<FunctionReturnType<typeof api.inventory.restoreTextiles>>

/** Undo restores only the exact removal; the server rejects expiry or a subsequent removal. */
export function confirmTrash(message: string, receipt: TrashReceipt | undefined, restore: RestoreTextiles | undefined): void {
  let used = false
  toast.success(message, receipt === undefined || restore === undefined ? undefined : {
    duration: 8_000,
    action: { label: 'Undo', onClick: () => {
      if (used) return
      used = true
      void restore({ textileIds: receipt.textileIds, expectedTrashedAt: receipt.trashedAt, expectedRevisions: receipt.revisions })
        .then(() => toast.success('Restored to your closet'))
        .catch((caught) => toast.error(errorMessage(caught)))
    } },
  })
}
