import { expect, test } from 'vitest'
import { DryTimer, ReviewStep, TimeCard } from '@/laundry/session-view'
import { RunningLoadSheetView, type RunningLoadDetail } from '@/laundry/running-load-sheet'
import { renderToStaticMarkup } from '@/test/markup'
import type { Action } from '@/laundry/session-view'

const now = 1_000_000
const detail = (extra: Partial<RunningLoadDetail> = {}): RunningLoadDetail => ({
  status: 'running', machineStartedAt: now, estimatedFinishAt: now + 40 * 60_000, washFinishedAt: null,
  dryerStartedAt: null, drying: null, machineName: 'Synthetic washer', textiles: [], doorLocks: true,
  cycleMinutes: 40, finishConfidence: 'observed', actions: [], ...extra,
})
const drawer = (record: RunningLoadDetail, time = now, extra = {}) => renderToStaticMarkup(<RunningLoadSheetView detail={record} now={time}
  onClose={() => undefined} openLink={({ className, children }) => <a className={className} href="/session/synthetic">{children}</a>} {...extra} />)

test('the running drawer keeps entered timer minutes as its source and unresolved steps open the load', () => {
  const html = drawer(detail())
  expect(html).toContain('From the 40 min you entered')
  expect(html).toContain('href="/session/synthetic"')
  expect(html).not.toContain('has finished</button>')
})

test('a dryer expiry asks for a dryness check and does not offer put-away or a dry status', () => {
  const drying = detail({ dryerStartedAt: now, drying: { status: 'ready', minutes: 1, readyAt: now + 60_000, dryerName: 'Synthetic dryer' } as RunningLoadDetail['drying'] })
  drying.actions.push({ id: 'start-drying', kind: 'task', task: 'dryer_start', phase: 'dryer_start', order: 0, status: 'confirmed' } as Action)
  const html = drawer(drying, now + 60_000)
  expect(html).toContain('Check dryness')
  expect(html).toContain('Check whether the pieces are dry')
  expect(html).toContain('Time is up')
  expect(html).not.toContain('Dry</p>')
  expect(html).not.toMatch(/Put away<\/(button|a)>/)
  expect(drying.status).toBe('running')
})

test('the session dryer timer uses a check time and explicit dryness uncertainty', () => {
  expect(renderToStaticMarkup(<DryTimer readyAt={now + 60_000} now={now} />)).not.toContain('Check at ')
  const expired = renderToStaticMarkup(<DryTimer readyAt={now} now={now} />)
  expect(expired).toContain('Time is up. Check whether the pieces are dry')
  expect(expired).not.toContain('Should be dry')
})

test('timer digits stay quiet while only expiry becomes a polite announcement', () => {
  const running = renderToStaticMarkup(<TimeCard big="40 min" sub="from the minutes entered" />)
  expect(running).toContain('role="timer" aria-live="off"')
  expect(running).toContain('role="status" aria-live="polite" aria-atomic="true"></span>')
  expect(renderToStaticMarkup(<TimeCard big="Time is up" sub="Check the washer" expired />)).toContain('Time is up. Check the washer</span>')
})

test('the quick finish action stays disabled offline or during an accepted queue request', () => {
  for (const state of [{ online: false }, { pending: true }]) {
    expect(drawer(detail(), now, { onFinished: () => undefined, ...state })).toMatch(/<button[^>]*disabled=""[^>]*>/)
  }
})

test('Back review shows the actual partial-mark amount without substituting the planned fill or volume', () => {
  const action: Action = { id: 'detergent', kind: 'treatment', phase: 'dispenser', order: 1, status: 'confirmed',
    supplyId: 'synthetic', supplyName: 'Synthetic marked detergent', detail: null, confidence: 'verified',
    dose: { amount: 1, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.8 }, stage: 'wash', placement: 'detergent_compartment', timing: null }
  const html = renderToStaticMarkup(<ReviewStep action={action} actualUsage={{ amount: 2, unit: 'cap', mark: 'Bar 1', fractionOfMark: 0.5 }}
    facts={{ washerName: 'Synthetic washer', cycle: 'normal', cycleMinutes: 40, doorLocks: true, drying: null }}
    progress="2 of 4" drumFullness={null} onNext={() => undefined} rememberExplanation={false} />)
  expect(html.replace(/<[^>]+>/g, '')).toContain('2 × 1/2 of Bar 1')
  expect(html).not.toContain('4/5')
  expect(html).not.toContain('39 ml')
  expect(action.dose?.fractionOfMark).toBe(0.8)
})

test('matching pieces count as one row; a guest piece or another color keeps its own row', () => {
  const tee = (textileId: string, extra: Partial<RunningLoadDetail['textiles'][number]> = {}) => ({ textileId, name: 'T-shirt', color: 'White', status: null, washCount: null, ...extra }) as RunningLoadDetail['textiles'][number]
  const html = drawer(detail({ textiles: [tee('a'), tee('b'), tee('c', { guest: true }), tee('d', { color: 'Black' })] }))
  expect(html.match(/T-shirt, White</g)).toHaveLength(1)
  expect(html).toContain('×2')
  expect(html).toContain('Guest item')
  expect(html).toContain('T-shirt, Black')
})

test('a confirmed wash finish shows when it finished, not a countdown or Time is up', () => {
  const html = drawer(detail({ washFinishedAt: now - 60_000 }), now)
  expect(html).toContain('Finished')
  expect(html).not.toContain('Time is up')
  expect(html).not.toContain('progressbar')
})

test('the drawer opens with the ring and the load card: minutes left, stage and contents, and one link to the load', () => {
  const tee = (textileId: string) => ({ textileId, name: 'T-shirt', color: 'White', status: null, washCount: null }) as RunningLoadDetail['textiles'][number]
  const html = drawer(detail({ textiles: [tee('a'), tee('b')] }), now, { onFinished: () => undefined })
  expect(html).toContain('aria-label="This load"')
  expect(html).toContain('Step 2 of 4: Wash')
  expect(html).toContain('Synthetic washer: 40 minutes left')
  expect(html).toContain('Washing')
  expect(html.match(/href="\/session\/synthetic"/g)).toHaveLength(1)
  expect(html).toContain('Synthetic washer has finished</button>')
})
