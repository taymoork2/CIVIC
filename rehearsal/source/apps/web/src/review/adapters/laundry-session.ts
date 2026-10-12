import { openRuntimeSession } from '@civic/canvas/runtime-session'
import type { AdapterContext } from '@civic/canvas/adapter'
import type { RuntimeSession } from '../runtime-client'
import { convexRuntimeClient } from '../convex-runtime-client'
import { setRuntimeIdentity } from './laundry-auth'

/** Native routes and curated presenters share the same data, clock, identity and reset boundary. */
export async function openLaundrySession(context: AdapterContext) {
  const run = await openRuntimeSession<RuntimeSession['seed']>(context)
  const facade = convexRuntimeClient(run.transport)
  setRuntimeIdentity(run.session.seed.subject)
  return { ...run, client: facade.client, async reset() { await run.reset(); facade.reset() } }
}
