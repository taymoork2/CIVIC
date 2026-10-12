import { openRuntimeSession } from '@civic/canvas/runtime-session'
import type { AdapterContext } from '@civic/canvas/adapter'
import type { RuntimeSession } from '../runtime-client'
import { convexRuntimeClient } from '../convex-runtime-client'
import { setRuntimeIdentity } from './laundry-auth'
import { clearPendingStep, supported } from 'virtual:rehearsal-private-scope'

/** Native routes and curated presenters share the same data, clock, identity, connection and reset boundary. */
export async function openLaundrySession(context: AdapterContext) {
  const family = context.scenario.id.startsWith('family.')
  if (family && !supported) throw Error('This app version lacks account-bound private recovery. Connect its current checkout.')
  const size = Number(new URLSearchParams(location.search).get('familySize') ?? 1000)
  let subject = ''
  // The app keeps its own saved step until an accepted write names its receipt; CIVIC's saved steps clear the same way.
  const run = await openRuntimeSession<RuntimeSession['seed']>(family && context.condition.id === 'offline' ? { ...context, condition: { ...context.condition, id: 'normal' } } : context, { ...(family ? { options: { pieces: size } } : {}), accepted: (args) => { if (typeof args.receiptId === 'string') clearPendingStep(subject, args.receiptId) } })
  const facade = convexRuntimeClient(run.transport)
  subject = run.status().subject ?? run.session.seed.subject
  setRuntimeIdentity(subject)
  run.subscribe((change) => {
    if (change === 'identity') { subject = run.status().subject ?? run.session.seed.subject; facade.reset(); setRuntimeIdentity(subject) }
    if (change === 'connection' && run.transport.connected() || change === 'time') facade.invalidate()
  })
  return { ...run, client: facade.client, async reset() { await run.reset(); facade.reset() } }
}
