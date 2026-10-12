import { useNavigate } from '@tanstack/react-router'
import { useConvexAuth, useQuery } from 'convex/react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import type { Id } from '@convex/_generated/dataModel'
import { api } from '@/api'
import { sessionStage } from '@/laundry/session-stage'
import { useNow } from '@/kit/use-now'
import { loadAppearance } from '@/kit/appearance'

export const noticeText = {
  washDone: (machine: string) => `${machine} has finished`,
  dryDone: (machine: string) => `${machine} has finished`,
  airCheck: 'Time to check what is dry',
  moveToDrying: 'Move to drying queue',
  checkDryness: 'Check dryness',
  open: 'Open',
  washer: 'The washer',
  dryer: 'The dryer',
} as const

const seenKey = 'timer-notices-seen'

function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(seenKey) ?? '[]') as string[]) } catch { return new Set() }
}

function saveSeen(seen: Set<string>): void {
  try { sessionStorage.setItem(seenKey, JSON.stringify([...seen].slice(-50))) } catch { /* private mode: notices may repeat after a reload */ }
}

/** One notice as it appears: the finished machine, and the next step as its action. */
export function showTimerNotice(title: string, action: string, go: () => void): void {
  toast(title, { duration: 15_000, action: { label: action, onClick: go } })
  try { if (document.visibilityState === 'visible') navigator.vibrate?.(200) } catch { /* vibration is optional */ }
}

/**
 * In-app notices for a timer that ends while the app is open: a washer or dryer the household started,
 * once per load and stage, with the next step. Push notifications cover a closed app; this covers an
 * open one. Only machine times recorded at start are used; nothing is estimated.
 */
export function TimerNotices({ householdId }: { householdId: string | null }) {
  const { isAuthenticated } = useConvexAuth()
  const navigate = useNavigate()
  const args = householdId === null || !isAuthenticated ? 'skip' as const : { householdId: householdId as Id<'households'> }
  const sessions = useQuery(api.execution.householdSessions, args)
  const drying = useQuery(api.dryingQueue.queue, args)
  const now = useNow(15_000)
  const seen = useRef<Set<string> | null>(null)
  // What was still running when this page first saw it: only those can "finish" in front of the person.
  const running = useRef(new Set<string>())

  useEffect(() => {
    if (loadAppearance().alerts === false) { running.current.clear(); return }
    if (sessions === undefined || drying === undefined) return
    if (seen.current === null) seen.current = loadSeen()
    const events: { key: string; title: string; action: string; go: () => void }[] = []
    for (const session of sessions) {
      if (session.status !== 'running') continue
      const times = sessionStage(session, now)
      const dryerOn = session.dryerStartedAt !== null
      // A wash marked finished by hand needs no notice; only the machine's own recorded time counts.
      if (!dryerOn && session.washFinishedAt !== null) continue
      const doneAt = dryerOn ? times.dryReadyAt : times.washReadyAt
      if (doneAt === null) continue
      const key = `${session.sessionId}:${dryerOn ? 'dry' : 'wash'}`
      if (doneAt > now) { running.current.add(key); continue }
      if (!running.current.has(key)) continue
      const machine = (dryerOn ? session.dryerName : session.machineName) ?? (dryerOn ? noticeText.dryer : noticeText.washer)
      events.push({ key, title: dryerOn ? noticeText.dryDone(machine) : noticeText.washDone(machine), action: dryerOn ? noticeText.open : noticeText.moveToDrying,
        go: () => void navigate({ to: '/session/$sessionId', params: { sessionId: session.sessionId } }) })
    }
    for (const run of drying.runs) {
      if (run.minutes === null) continue
      const key = `run:${run.runId}:${run.startedAt}`
      const doneAt = run.startedAt + run.minutes * 60_000
      if (doneAt > now) { running.current.add(key); continue }
      if (!running.current.has(key)) continue
      events.push({ key, title: noticeText.dryDone(run.dryerName ?? noticeText.dryer), action: noticeText.checkDryness, go: () => void navigate({ to: '/drying' }) })
    }
    for (const event of events) {
      if (seen.current.has(event.key)) continue
      seen.current.add(event.key)
      running.current.delete(event.key)
      showTimerNotice(event.title, event.action, event.go)
    }
    if (events.length > 0) saveSeen(seen.current)
  }, [sessions, drying, now, navigate])

  return null
}
