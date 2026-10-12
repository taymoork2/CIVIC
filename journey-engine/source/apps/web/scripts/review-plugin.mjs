import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { civicReview } from '@civic/vite-connector'
import { canvasRoot } from '@civic/canvas/root'
import { laundryReviewAdapter } from './review-adapter.mjs'
import { agentDestinations, dispatchReview, publicDestination } from './review-agents.mjs'
import { coverageBridge } from '@civic/vite-connector/coverage'
import { civicShared } from './review-civic.mjs'
import { laundryConnector } from './review-laundry-connector.mjs'
import { runtimeService } from './review-runtime.mjs'

/** This host's review: CIVIC's canvas and Vite connector with Laundry's connector, review adapter, agents and isolated runtime. */
export function reviewPlugin() {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repo = resolve(web, '../..')
  return civicReview({
    host: web,
    canvas: canvasRoot,
    repo,
    connectors: { laundry: laundryConnector },
    runtime: runtimeService,
    engineRoots: [join(canvasRoot, 'src'), join(web, 'src/review'), join(web, 'scripts')],
    picker: { starterTemplate: join(canvasRoot, 'examples/notebook') },
    review: ({ project }) => ({
      adapter: laundryReviewAdapter,
      coverage: (context) => coverageBridge({ repo, contractFile: project.coverageFile, contractRoot: project.manifestRoot, ...context }),
      agents: { destinations: agentDestinations, dispatch: dispatchReview, publicDestination },
      // Inside an Amp orb, PUBLIC_URL names the authenticated portal for this service.
      publicHost: process.env.AMP_ORB && process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL).host : null,
      // Notes and hand-offs go to CIVIC's store in the git common directory, shared by every worktree (D39).
      shared: process.env.CIVIC_SHARED === '0' ? null : civicShared({ repo }),
    }),
  })
}
