import { useState } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { addTimeText } from '@/copy-run'
import { Note, TextField } from '@/laundry/laundry-ui'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, useConvexCall } from '@/kit/ui'

const maxMinutes = 120

/**
 * The design's "Add time" sheet on a running wash: the machine still has minutes to go, so the
 * person adds them. The timer's length grows by that many minutes and its finish time, with the
 * steps timed from it, moves later; nothing else about the load changes.
 */
export function AddTimeSheet({ sessionId, washer, online, onClose, onDone }: {
  sessionId: Id<'sessions'>
  washer: string
  online: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [value, setValue] = useState('')
  const add = useConvexCall(api.sessionTime.addMinutes)
  const minutes = Number.parseInt(value, 10)
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= maxMinutes
  const submit = () => {
    if (!valid || add.pending || !online) return
    void add.run({ sessionId, minutes }).then((result) => { if (result !== undefined) onDone() })
  }
  return (
    <Sheet kicker={washer} title={addTimeText.title} onClose={onClose} dirty={value !== ''}
      footer={<Button size="lg" className="w-full" disabled={!valid || add.pending || !online} onClick={submit}>{addTimeText.update}</Button>}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <TextField id="add-time-minutes" label={addTimeText.field} type="text" inputMode="numeric" autoComplete="off" autoFocus maxLength={3}
          value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
          error={value !== '' && !valid ? addTimeText.range : null} />
        <Note>{addTimeText.hint}</Note>
        <ErrorNotice error={add.error} />
      </form>
    </Sheet>
  )
}
