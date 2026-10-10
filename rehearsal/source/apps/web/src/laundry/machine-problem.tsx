import { useQuery } from 'convex/react'
import { useState } from 'react'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { drawerText } from '@/copy-drawer'
import { machineProblemText as text } from '@/copy-laundry'
import { ActionList, AnswerRow, ChangeCard, Note, Section } from '@/laundry/laundry-ui'
import { DesignIcon } from '@/kit/design-icons'
import { Sheet } from '@/kit/sheet'
import { ErrorNotice, useConvexCall } from '@/kit/ui'

/**
 * The design's "Machine problem" sheet: a door that won't lock (or a washer that won't start) moves
 * the load to another washer in the same room, showing what changes first; a stuck drawer recalculates
 * without it. Nothing changes until the person confirms.
 */
export function MachineProblemSheet({ sessionId, washer, online, onClose, onMoved, onRecalculated, onCancel }: {
  sessionId: Id<'sessions'>
  washer: string
  online: boolean
  onClose: () => void
  onMoved: (washer: string) => void
  /** The load was re-planned without the drawer and its recipe confirmed. */
  onRecalculated: () => void
  /** Trial safety valve (not in the design): cancel a load started by mistake, before the washer runs. */
  onCancel: () => void
}) {
  const [problem, setProblem] = useState<'door' | 'drawer' | null>(null)
  const [machineId, setMachineId] = useState<Id<'machines'> | null>(null)
  const options = useQuery(api.execution.moveOptions, problem === 'door' ? { sessionId, ...(machineId === null ? {} : { machineId }) } : 'skip')
  const preview = useQuery(api.execution.withoutDrawerPreview, problem === 'drawer' ? { sessionId } : 'skip')
  const move = useConvexCall(api.execution.moveWasher)
  const recalculate = useConvexCall(api.execution.withoutDrawer)
  const picked = options?.washers.find((entry) => entry.machineId === machineId) ?? null
  const canMove = problem === 'door' && picked !== null && options?.unavailable === null && online && !move.pending
  const canRecalculate = problem === 'drawer' && preview !== undefined && preview.unavailable === null && online && !recalculate.pending
  return (
    <Sheet kicker={washer} title={text.title} onClose={onClose} dirty={problem !== null}
      footer={problem === 'drawer' ? (
        <Button size="lg" className="w-full" disabled={!canRecalculate} onClick={() => {
          void recalculate.run({ sessionId }).then((result) => { if (result !== undefined) onRecalculated() })
        }}>{drawerText.recalculate}</Button>
      ) : (
        <Button size="lg" className="w-full" disabled={!canMove} onClick={() => {
          if (picked === null) return
          void move.run({ sessionId, machineId: picked.machineId }).then((result) => { if (result !== undefined) onMoved(picked.name) })
        }}>{text.move}</Button>
      )}>
      <div className="grid gap-6">
        <AnswerRow label={text.title} answers={[
          { key: 'door', label: text.door, pressed: problem === 'door', icon: <DesignIcon name="door" size={24} strokeWidth={1.6} />, onClick: () => { setProblem('door'); setMachineId(null) } },
          { key: 'drawer', label: drawerText.drawer, pressed: problem === 'drawer', icon: <DesignIcon name="drawer" size={24} strokeWidth={1.6} />, onClick: () => { setProblem('drawer'); setMachineId(null) } },
        ]} />
        {problem === null ? null : <Note>{problem === 'door' ? text.doorFact : drawerText.drawerFact}</Note>}
        {problem === 'door' ? (
          <>
            {options === undefined ? null : options.washers.length === 0 ? <Note>{text.noWashers}</Note> : (
              <Section heading={text.whichWasher}>
                <ActionList label={text.whichWasher} actions={options.washers.map((entry) => ({ key: entry.machineId, label: entry.name, ...(entry.machineId === machineId ? { hint: text.picked } : {}), onClick: () => setMachineId(entry.machineId as Id<'machines'>) }))} />
              </Section>
            )}
            {picked === null || options === undefined ? null : options.unavailable !== null ? <ErrorNotice error={options.unavailable} />
              : options.changes.length === 0 ? <Note>{text.noChanges}</Note>
              : <ChangeCard heading={text.changesOn(picked.name)} changes={options.changes.map((change) => ({ title: change.stage, from: change.from, to: change.to }))} />}
            <Note>{text.stays(washer)}</Note>
            <ErrorNotice error={move.error} />
          </>
        ) : problem === 'drawer' ? (
          <>
            {preview === undefined ? null : preview.unavailable !== null ? <ErrorNotice error={preview.unavailable} />
              : preview.changes.length === 0 ? <Note>{drawerText.noChanges}</Note>
              : <ChangeCard heading={drawerText.changes} changes={preview.changes.map((change) => ({ title: change.stage, from: change.from, to: change.to }))} />}
            <Note>{text.stays(washer)}</Note>
            <ErrorNotice error={recalculate.error} />
          </>
        ) : null}
        <Button variant="link" size="unstyled" type="button" className="justify-self-start text-conflict-ink" onClick={onCancel}>{text.cancelLoad}</Button>
      </div>
    </Sheet>
  )
}
