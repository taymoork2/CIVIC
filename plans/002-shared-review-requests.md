# Plan 002: Share JSON request handling without losing project isolation

> Executor: this is the data track's first unit. Own only the paths below; do not edit AppCanvas, generated CSS, the plan index, or another worker's changes. Root reviews evidence and updates the index.

## Status and drift

- P1; effort S/M; change risk MED; category tech debt/correctness; status TODO.
- Planned at `b99d37b2`, 2026-10-18. Depends on: baseline only; parallel with 001. Plan 003 follows this unit because both edit the picker.
- Run `rtk git status --short` and `rtk git diff --stat b99d37b2 -- packages/canvas/src/review-api.ts packages/canvas/src/project-request.ts packages/canvas/src/project-picker.tsx packages/canvas/src/source-browser.tsx packages/canvas/src/coverage-panel.tsx`. Reconcile changes against excerpts before editing.

## Why and current state

`project-request.ts` binds every normal review request to a project:

```ts
if (!projectKey) throw Error('Project requests must be bound before opening the workspace')
headers.set('x-rehearsal-project', projectKey)
return fetcher(path, { ...options, headers })
```

`review-api.ts:3` duplicates the same JSON pattern found in `project-picker.tsx:26`, `source-browser.tsx:10`, and `coverage-panel.tsx:48`:

```ts
export async function reviewApi<T>(path: string, data?: unknown): Promise<T> {
  const response = await projectFetch(`/api/review/${path}`, data === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Review request failed. Your draft is kept.')
  return result
}
```

Coverage additionally distinguishes HTTP 409 and rejects mismatched source revisions; it uses a mutation counter to reject stale poll results. Preserve these behaviors. Project-picker's raw `/review` and `/api/review/index` fetches during a project-switch restart intentionally bootstrap a newly rotated session: do not blindly route them through the old bound project header. Image/download requests remain non-JSON `projectFetch` calls.

## Scope and shape

Edit `packages/canvas/src/review-api.ts`, `project-picker.tsx`, `source-browser.tsx`, `coverage-panel.tsx`; create `review-api.test.ts`. Read but preserve `project-request.ts`'s exported API. No backend/route/schema/dependency changes.

Extend the existing function compatibly to `reviewApi<T>(path, data?, options?)`, where options carries `signal` and an optional fallback error message. Existing two-argument calls retain GET/POST behavior. Preserve server error messages and expose HTTP status on request errors so coverage retains its special conflict message. Use the smallest typed Error convention sufficient for this; no transport factory, retries, query cache, or automatic resubmission. Aborts propagate as aborts.

Match Vitest and fake-fetch conventions in `runtime-session.test.ts`; its fixture records calls and returns real `Response` objects. Match the existing projectFetch header contract, rather than bypassing it. Keep ADR 0010's external-source/evidence ownership unchanged.

## Steps and commands

1. Add `review-api.test.ts` using a stubbed fetch and `bindProjectRequests`. Test GET, JSON POST, bound project header, server error/fallback, status 409, caller AbortSignal, cancellation, and malformed/non-JSON failure responses. Do not assert formatting or internal helper names.
   - Gate: `rtk pnpm --dir packages/canvas exec vitest run src/review-api.test.ts`; new behavior tests fail for the expected missing capability before implementation.
2. Extend `reviewApi` with the options/error contract. Prevent invalid error bodies from obscuring a useful fallback; invalid success JSON must remain a failure. Never turn network or abort errors into empty successful data.
   - Gate: the focused test command passes; `rtk pnpm --dir packages/canvas run check` exits 0.
3. Replace only the three JSON request copies with the shared helper. Preserve source-search abort/debounce, coverage conflict/source checks and mutation ordering, and picker cancellation/restart bootstrapping.
   - Gate: `rtk pnpm --dir packages/canvas exec vitest run` passes; `rtk rg -n 'async function request|await response.json' packages/canvas/src/project-picker.tsx packages/canvas/src/source-browser.tsx packages/canvas/src/coverage-panel.tsx` is inspected to confirm any remaining parsing has a documented non-duplicate role.
4. Verify cancellation while closing/searching and a project conflict with an isolated fixture, without switching the user's shared host. Root runs the integrated browser suites after 003.
   - Gate: `rtk pnpm --dir packages/canvas run test:host` passes; no current-project response overwrites another project's UI or unsaved drafts.

## Done / stop / maintenance

- [ ] All three normal JSON clients use the existing API helper; scoped headers and per-feature messages remain.
- [ ] Focused tests and canvas typecheck/test suites pass; no automatic retry of writes is introduced.
- [ ] Existing `reviewApi(path, data)` consumers and non-JSON fetch paths still work.
- [ ] Only scoped paths changed; root updates the index.

Branch suggestion `refactor/shared-review-requests`; Conventional Commit example `refactor(canvas): share scoped review request handling`. Commit/publication needs execution authority. Stop on a required endpoint change, changed project-binding semantics, cross-project data leakage, source writes, or two failed repairs. New JSON callers should use this helper; binary/bootstrap callers keep explicit boundaries.
