import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { civicReview } from '@civic/vite-connector'
import { laundryReviewAdapter } from './review-adapter.mjs'
import { agentDestinations, dispatchReview, publicDestination } from './review-agents.mjs'
import { coverageBridge } from '@civic/vite-connector/coverage'
import { civicShared } from './review-civic.mjs'
import { laundryConnector } from './review-laundry-connector.mjs'
import { runtimeService } from './review-runtime.mjs'

/** This host's review: CIVIC's Vite connector with Laundry's connector, review adapter, agents and isolated runtime. */
export function reviewPlugin() {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const repo = resolve(web, '../..')
  return civicReview({
    host: web,
    repo,
    connectors: { laundry: laundryConnector },
    runtime: runtimeService,
    engineRoots: [join(web, 'src/review'), join(web, 'scripts')],
    picker: { discoveredAdapter: join(web, 'src/review/discovered-adapter.tsx'), starterTemplate: join(web, 'examples/rehearsal-demo') },
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
