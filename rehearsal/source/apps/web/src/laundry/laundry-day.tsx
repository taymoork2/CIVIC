import { useMutation, useQuery } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { useEffect, useState, type ReactNode } from 'react'
import { useSteady } from '@/kit/use-steady'

import { api } from '@/api'
import { hangingSession } from '@/closet/closet-view'
import { HomeDock } from '@/home/home-dock'
import { dryingFacts, hubState, sharedStartSpent, sharedWasherCount, urgentFlag, type DockView, type HubInputs, type HubState, type SharedStart } from '@/home/hub-state'
import type { Textile } from '@/household/inventory-types'
import { useHouseholdData } from '@/household/household-data'
import { applianceCopy } from '@/copy-household'
import { dryerBlocksText } from '@/copy-drying'
import { dryerBlocks, money } from '@/kit/units'
import { defaultHomeUntil, startOfDay, todayAt } from '@/laundry/day-plan'
import type { DayPick } from '@/laundry/plan-pick'

/**
 * Laundry day with its live data: everything comes from the server, so a closed tab or a
 * relaunched app lands back on the same step. Undefined until every part has loaded, so the hub
 * never shows a step it has not checked.
 */

type HouseholdId = FunctionArgs<typeof api.plans.upNext>['householdId']

/** The garments hanging to dry, and the finished loads All dry can clear them from. */
export function hangingDay(textiles: readonly Pick<Textile, 'textileId' | 'status' | 'guest'>[], sessions: Parameters<typeof hangingSession>[0]): HubInputs['hanging'] {
  const hanging = textiles.filter((textile) => textile.status === 'hanging' && !textile.guest)
  const sessionIds = new Set<string>()
  for (const textile of hanging) {
    const sessionId = hangingSession(sessions, textile.textileId as string)
    if (sessionId !== null) sessionIds.add(sessionId)
  }
  return { count: hanging.length, sessionIds: [...sessionIds] }
}

// ---- Kept on this phone only, never machine status (design invariant 10) -----------------------------

/** One value in this phone's storage, or in memory where storage is blocked (private windows). */
export function phoneStore<Value extends object>(key: string, event: string, valid: (value: Partial<Value>) => boolean) {
  let memory: Value | null = null
  const read = (): Value | null => {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null')
      if (typeof value === 'object' && value !== null && valid(value as Partial<Value>)) return value as Value
    } catch {
      // Blocked storage: the copy in memory.
    }
    return memory
  }
  const save = (value: Value): void => {
    memory = value
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Kept in memory above.
    }
    window.dispatchEvent(new Event(event))
  }
  const useValue = (): Value | null => {
    const [value, setValue] = useState<Value | null>(null)
    useEffect(() => {
      const update = () => setValue(read())
      update()
      window.addEventListener(event, update)
      window.addEventListener('storage', update)
      return () => { window.removeEventListener(event, update); window.removeEventListener('storage', update) }
    }, [])
    return value
  }
  return { read, save, useValue }
}

export const dayPickStore = phoneStore<DayPick>('washcloset:private:day-pick', 'washcloset:day-pick', (value) => typeof value.planId === 'string' && typeof value.day === 'number' && value.v === 2)

type DryerSays = NonNullable<HubInputs['dryerSays']>
const saysStore = phoneStore<DryerSays>('washcloset:private:dryer-says', 'washcloset:dryer-says', (value) => typeof value.key === 'string' && typeof value.end === 'number')
/** What the dryer's display said, as "Dryer says: __ min". */
export const saveDryerSays = saysStore.save
export const useDryerSays = saysStore.useValue

const sharedStore = phoneStore<SharedStart>('washcloset:private:shared-start', 'washcloset:shared-start', (value) => typeof value.planId === 'string')
/** "Washers free" and "Dryers free" in a shared room, turned into the loads to start. */
export const saveSharedStart = sharedStore.save
export const useSharedStart = sharedStore.useValue

/** Once a wash of that plan is done the start-of-pass counts are spent (design 11); every screen that reads the day says so. */
function useSharedStartSpent(spentPlanId: string | null): void {
  useEffect(() => {
    if (spentPlanId === null) return
    const entry = sharedStore.read()
    if (entry !== null && !('done' in entry) && entry.planId === spentPlanId) saveSharedStart({ planId: entry.planId, done: true })
  }, [spentPlanId])
}

/**
 * What the server should hear about the plan's held-back start: its reminder, with the dryer time it is
 * held back from, or that the hold is gone. Only the wash steps of a running or waiting day say anything;
 * before the move the dryer's end, and so this time, still moves with the clock.
 */
export function startLoadReminderCall(state: HubState | undefined): { readonly remind: { readonly planId: string; readonly loadId: string; readonly at: number; readonly basis?: { readonly key: string; readonly end: number; readonly source: 'entered' | 'wash' | 'says' } } } | { readonly cancel: string } | null {
  if (state?.kind !== 'running' && state?.kind !== 'pass') return null
  const planId = state.kind === 'pass' ? state.planId : state.next?.planId ?? null
  if (planId === null) return null
  const step = state.step
  if (step === undefined || step.at === null || step.loadId === null) return { cancel: planId }
  const basis = step.dryerKey === null || step.dryerSource === undefined ? {} : { basis: { key: step.dryerKey, end: step.dryerEnd, source: step.dryerSource } }
  return { remind: { planId, loadId: step.loadId, at: step.at, ...basis } }
}

/**
 * A held-back start ("Start load 3 at about 11:20") gets one server reminder, so a closed tab
 * still hears it; a new time (the dryer said otherwise) moves it. Every screen that reads the day
 * asks; the server keeps one per plan. It carries the dryer time it was held back from, which the
 * server checks again on delivery. When the day says there is no hold (the dryer's time changed and
 * the wash can start now), the reminder is cancelled instead of left to call for a start already due.
 */
function useStartLoadReminder(state: HubState | undefined): void {
  const remind = useMutation(api.plans.remindStartLoad)
  const cancel = useMutation(api.plans.cancelStartLoadReminder)
  const call = startLoadReminderCall(state)
  const wanted = call === null ? null : JSON.stringify(call)
  useEffect(() => {
    if (wanted === null) return
    const action = JSON.parse(wanted) as NonNullable<ReturnType<typeof startLoadReminderCall>>
    if ('cancel' in action) cancel({ planId: action.cancel as FunctionArgs<typeof api.plans.cancelStartLoadReminder>['planId'] }).catch(() => undefined)
    else remind({ ...action.remind, planId: action.remind.planId as FunctionArgs<typeof api.plans.remindStartLoad>['planId'] }).catch(() => undefined)
  }, [remind, cancel, wanted])
}

export function useLaundryDay(householdId: string | null, now: number): HubState | undefined {
  const shared = useHouseholdData(householdId)
  const args = householdId === null ? 'skip' as const : { householdId: householdId as HouseholdId }
  const minute = Math.floor(now / 60_000) * 60_000
  const livePlan = useQuery(api.plans.upNext, args)
  const plan = livePlan === undefined ? shared?.plan : livePlan
  const sessions = useQuery(api.execution.householdSessions, args) ?? shared?.sessions
  const inventory = useQuery(api.inventory.list, args) ?? shared?.inventory
  const queue = useQuery(api.dryingQueue.queue, args)
  const attention = useSteady(useQuery(api.closet.attention, householdId === null ? 'skip' : { householdId: householdId as HouseholdId, now: minute })) ?? shared?.attention
  // Live data waits for the drying queue too; the saved copy used offline has none, so it goes without.
  const dryerSays = useDryerSays()
  const sharedEntry = useSharedStart()
  const pick = dayPickStore.useValue()
  const until = pick !== null && pick.planId === plan?.planId && pick.day === startOfDay(now) ? todayAt(pick.until ?? defaultHomeUntil, now) : null
  const state = plan === undefined || sessions === undefined || inventory === undefined || attention === undefined || (queue === undefined && livePlan !== undefined) ? undefined : hubState({ hamper: attention.hamper, plan, sessions, hanging: hangingDay(inventory.textiles, sessions),
    textileNames: new Map(inventory.textiles.map((textile) => [textile.textileId as string, textile.name])), ...(queue === undefined ? {} : { drying: dryingFacts(queue) }),
    urgentIds: new Set(inventory.textiles.filter((textile) => textile.status === 'dirty' && urgentFlag(textile.flag, now)).map((textile) => textile.textileId as string)),
    dryerSays, sharedStart: { entry: sharedEntry, washers: sharedWasherCount(inventory.machines) }, ...(until === null ? {} : { dayUntil: until }) }, now)
  useStartLoadReminder(state)
  useSharedStartSpent(plan != null && sharedStartSpent(plan, sessions, now) ? plan.planId : null)
  const detail = useQuery(api.execution.sessionDetail, state?.kind === 'finished' && state.toDryer ? { sessionId: state.row.sessionId as FunctionArgs<typeof api.execution.sessionDetail>['sessionId'] } : 'skip')
  const saved = useQuery(api.plans.get, detail?.planId === undefined ? 'skip' : { planId: detail.planId })
  if (state?.kind !== 'finished' || !state.toDryer || detail?.sessionId !== state.row.sessionId || inventory === undefined) return state
  const planned = saved?.planId === detail.planId ? saved.result.loads.find((load) => load.id === detail.loadId)?.drying : null
  const machine = saved?.planId === detail.planId ? saved.machines.find((entry) => entry.machineId === planned?.dryerId) : null
  const dryMinutes = detail.drying?.minutes ?? state.row.dryMinutes
  const currency = inventory.planning.currency ?? saved?.result.cost.currency ?? 'USD'
  // A dryer that sells time shows blocks and price from the minutes known, never a per-start price it does not have.
  const priced = machine?.location === 'shared' && machine.pricePerStart != null ? { pricePerStart: machine.pricePerStart, blockMinutes: machine.blockMinutes } : null
  const blocks = priced === null ? null : dryerBlocks(dryMinutes, priced)
  const price = priced === null ? null : blocks !== null ? dryerBlocksText.about(blocks.blocks, money(blocks.price, currency))
    : priced.blockMinutes != null ? applianceCopy.perBlock(money(priced.pricePerStart, currency), priced.blockMinutes) : money(priced.pricePerStart, currency)
  return { ...state, row: { ...state.row, heat: detail.drying?.heatLabel ?? planned?.heatLabel ?? null, dryMinutes, price } }
}

export type DockLink = (target: DockView['target'] | { readonly to: 'add' | 'make' }, props: { className: string; children: ReactNode }) => ReactNode

/** Other tabs show only steps tied to a load, a machine or a clock. Hamper prompts stay in Laundry. */
export function LaundryDock({ householdId, now, renderLink, idle = true }: { householdId: string | null; now: number; renderLink: DockLink; idle?: boolean }) {
  const state = useLaundryDay(householdId, now)
  if (state === undefined || (!idle && (state.kind === 'empty' || state.kind === 'hamper'))) return null
  return <HomeDock state={state} renderLink={renderLink} />
}
