import { useState } from 'react'
import { SignInUnavailable } from '@/account/account'
import { AccountForm } from '@/account/auth-pages'
import { OfflineUnavailable } from '@/offline-view'
import { OfflineSessionView } from '@/laundry/session-view'
import type { SessionProjection } from '@/private-state'
import { Loading } from '@/kit/ui'
import { PageStatus } from '@/kit/page-status'
import { RouteErrorView } from '@/kit/route-error'
import { HomeOutfitAction } from '@/home/home-sections'
import { FixtureConvex } from '@/dev/fixture-preview'
import { MePreview } from '@/dev/me-preview'
import { DraftChanged, DraftNotice, DraftRecovery, ForgetIntake } from '@/kit/device-state'
import { Sheet } from '@/kit/sheet'
import { Button } from '@/components/ui/button'

export const recoveryScreens = ['auth-pending', 'auth-expired', 'auth-failed', 'offline-first-visit', 'offline-signed-out', 'offline-running', 'task-loading', 'page-loading', 'page-failed', 'page-end', 'me-empty-history', 'outfit-action', 'draft-garment', 'draft-appliance', 'draft-product', 'draft-unavailable', 'draft-retry-garment', 'draft-retry-appliance', 'draft-retry-product', 'draft-changed', 'draft-removed', 'draft-forget'] as const

/** Real recovery presenters; synthetic data never enters the device's private store. */
export function RecoveryPreview({ screen }: { screen: typeof recoveryScreens[number] }) {
  return <><RecoveryState screen={screen} /><p className="mx-auto mt-6 max-w-[36rem] text-[length:var(--step--1)] text-ink-2">Preview only · nothing is recorded.</p></>
}

function RecoveryState({ screen }: { screen: typeof recoveryScreens[number] }) {
  const [retried, setRetried] = useState(false)
  if (screen.startsWith('draft-')) {
    if (retried) return <div className="page"><p role="status">Preview dismissed. No draft or record was changed.</p></div>
    if (screen === 'draft-forget') return <ForgetIntake onKeep={() => setRetried(true)} onForget={() => setRetried(true)} onClose={() => setRetried(true)} />
    if (screen === 'draft-changed' || screen === 'draft-removed') return <DraftChanged removed={screen === 'draft-removed'} onClose={() => setRetried(true)} />
    if (screen === 'draft-unavailable') return <Sheet title="Add a product" onClose={() => setRetried(true)} closeAtTop footer={<Button onClick={() => setRetried(true)}>Keep form open</Button>}><DraftNotice stored={false} /></Sheet>
    return <DraftRecovery title={screen.endsWith('garment') ? 'adding clothes' : screen.endsWith('appliance') ? 'this appliance' : 'this product'} photo={screen.endsWith('garment')} attempted={screen.startsWith('draft-retry-')} onClose={() => setRetried(true)} onContinue={() => setRetried(true)} onDiscard={() => setRetried(true)} />
  }
  if (screen === 'auth-pending') return <Loading what="your household" startup />
  // Confirmed expiry follows the ordinary sign-in route, retaining its safe return address.
  if (screen === 'auth-expired') return <AccountForm mode="sign-in" redirect="/closet" visualPreview />
  if (screen === 'auth-failed') return <SignInUnavailable />
  if (screen === 'offline-first-visit' || screen === 'offline-signed-out') return <OfflineUnavailable />
  if (screen === 'offline-running') return <FixtureConvex data={{}}><OfflineSessionView projection={projection} /></FixtureConvex>
  if (screen === 'me-empty-history') return <MePreview />
  if (screen === 'page-failed') return retried ? <div className="page"><PageStatus shown={45} total={45} more={false} loading={false} onMore={() => {}} label="Show more clothes" /></div> : <RouteErrorView error={new Error('We couldn’t load your clothes. Your saved records are unchanged.')} onRetry={() => setRetried(true)} />
  return <div className="page grid gap-4">
    <h1 className="text-[length:var(--step-3)] font-semibold">{screen === 'outfit-action' ? 'Home' : screen === 'task-loading' ? 'Add clothes' : 'Closet'}</h1>
    {screen === 'outfit-action' ? <HomeOutfitAction><p>Outfit preview only; no pieces are saved.</p></HomeOutfitAction>
      : screen === 'task-loading' ? <Loading what="the clothing form" />
      : <PageStatus shown={screen === 'page-loading' ? 40 : 45} total={45} more={screen === 'page-loading'} loading={screen === 'page-loading'} onMore={() => {}} label="Show more clothes" />}
  </div>
}

// A previously confirmed Start and its recorded duration; no inferred machine time.
const startedAt = Date.UTC(2026, 9, 10, 19)
const projection: SessionProjection = {
  sessionId: 'preview-offline-session', householdId: 'preview-household', status: 'running', revision: 1,
  machineName: 'Washer 14', startedAt, machineStartedAt: startedAt, cycleMinutes: 45, doorLocks: false,
  estimatedFinishAt: startedAt + 45 * 60_000, finishConfidence: 'recorded', washFinishedAt: null, drying: null,
  textiles: [{ textileId: 'preview-offline-towel', name: 'Gray bath towel', color: 'Gray' }],
  actions: [], savedAt: startedAt,
}
