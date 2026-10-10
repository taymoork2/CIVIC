import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import type { FunctionArgs } from 'convex/server'

import type { CurrentHousehold } from '@/account/account'
import { api } from '@/api'
import { firstRunText } from '@/copy'
import { onboardingText } from '@/copy-account'
import { JoinWithCode, knownName } from '@/account/join-flow'
import { ChooseScreen, CelebrationScreen, NextStepsScreen, NameScreen, SetupFlow } from '@/account/onboarding-screens'
import { beginOnboarding, endOnboarding, finishOnboardingCelebration, onboardingCelebration } from '@/account/onboarding-state'
import { useConvexCall } from '@/kit/ui'

/**
 * First run, in the order a person meets it: create a household or join one, name it, a one-time
 * setup confirms a new household, followed by optional closet/invite choices. Every step can wait;
 * /setup and Replay reopen the checklist later.
 *
 * Membership appears the moment a household is created or joined, so `onboarding-state` keeps
 * this flow on screen, without tabs, until the person leaves it.
 */

/** A first name to call the person by, or null when all we have is an email address or nothing. */
export function firstName(displayName: string | null | undefined): string | null {
  const name = displayName?.trim() ?? ''
  if (name.length === 0 || name.includes('@')) return null
  return name.split(/\s+/)[0]!.slice(0, 50)
}

/** The household's suggested name: "Pat's home", or "Home" without a name to use. */
export function householdNameFor(displayName: string | null | undefined): string {
  const name = firstName(displayName)
  return firstRunText.householdName(name)
}

type CreateArgs = FunctionArgs<typeof api.households.createHousehold>

/** The household and its first person as one create call: the person, linked to them. Others are added from Household. */
export function firstRunArgs(displayName: string | null | undefined, householdName?: string): CreateArgs {
  const name = firstName(displayName)
  return {
    name: householdName ?? householdNameFor(displayName),
    wearers: [{ name: name ?? firstRunText.me, kind: 'adult', self: true }],
    ...knownName(displayName),
  }
}

export type FirstRunStep = 'choose' | 'name' | 'join' | 'celebrate' | 'setup'
/** `linked: false` means the invite's closet was claimed meanwhile, said once on the celebration. */
type Made = { householdId: string; name: string; kind: 'created' | 'joined'; linked?: boolean }

export function FirstRun({ displayName, household, initialStep, closetTaken = false }: {
  displayName: string | null
  /** Present once membership exists, while onboarding is still on screen. */
  household?: CurrentHousehold
  initialStep?: FirstRunStep
  /** From an invite link whose closet was claimed before they joined. */
  closetTaken?: boolean
}) {
  const navigate = useNavigate()
  const [step, setStep] = useState<FirstRunStep>(() => initialStep ?? (household === undefined ? 'choose' : onboardingCelebration() === 'joined' ? 'celebrate' : 'setup'))
  const [made, setMade] = useState<Made | null>(null)
  // Drafts live here, not in the step screens, so Back and the other path keep what was typed.
  // A null name draft means no edit yet, so the suggested name still shows.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [codeDraft, setCodeDraft] = useState('')
  const create = useConvexCall(api.households.createHousehold)
  const guidance = useConvexCall(api.households.setGuidance)
  // Loading and development refreshes can remount this screen; only an explicit exit ends setup.

  const current = household ?? (made === null ? undefined : { householdId: made.householdId as CurrentHousehold['householdId'], name: made.name, washPlace: null })
  useEffect(() => {
    // Older in-tab setup holds are upgraded once; the server owns subsequent resumption.
    if (household !== undefined && household.guidance === undefined) void guidance.run({ householdId: household.householdId, command: 'start', stage: household.role === 'member' ? 'clothes' : 'setup' })
  }, [household?.householdId, household?.guidance])
  const saveGuidance = async (command: 'start' | 'dismiss', stage?: 'intent' | 'setup' | 'household' | 'clothes' | 'laundry') => {
    if (current === undefined || guidance.pending) return false
    return await guidance.run({ householdId: current.householdId, command: command === 'start' && household?.guidance?.status === 'completed' ? 'replay' : command, ...(stage === undefined ? {} : { stage }) }) !== undefined
  }
  const finish = async () => {
    if (!await saveGuidance('dismiss')) return
    endOnboarding()
    void navigate({ to: '/' })
  }
  const startClothes = async () => {
    if (!await saveGuidance('start', 'clothes')) return
    endOnboarding()
    void navigate({ to: '/closet', search: { add: 'choose' } })
  }
  const celebrate = (next: Made) => {
    setMade(next)
    setNameDraft(null)
    setCodeDraft('')
    setStep(next.kind === 'created' ? 'setup' : 'celebrate')
  }

  if (step === 'join') return <JoinWithCode displayName={displayName} initialCode={codeDraft} onCodeChange={setCodeDraft} onBack={() => setStep('choose')} onJoined={(target) => celebrate({ ...target, kind: 'joined' })} />
  if (step === 'name') {
    return <NameScreen value={nameDraft ?? householdNameFor(displayName)} onChange={setNameDraft} pending={create.pending} error={create.error} onBack={() => setStep('choose')} onSubmit={(name) => void (async () => {
      beginOnboarding('created')
      const created = await create.run({ ...firstRunArgs(displayName, name), startGuidance: true })
      if (created === undefined) return endOnboarding()
      celebrate({ householdId: created.householdId, name: created.name, kind: 'created' })
    })()} />
  }
  if (step === 'celebrate' && current !== undefined) {
    const kind = made?.kind ?? onboardingCelebration() ?? 'created'
    const note = closetTaken || made?.linked === false ? onboardingText.celebrate.closetTaken : undefined
    return <CelebrationScreen kind={kind} householdName={current.name} note={note} primaryLabel={kind === 'joined' ? 'Continue' : undefined} onPrimary={() => { finishOnboardingCelebration(); setStep('setup') }} />
  }
  const joiner = household?.role === 'member' || (household === undefined && made?.kind === 'joined')
  if (step === 'setup' && current !== undefined) {
    if (joiner) return <NextStepsScreen pending={guidance.pending} error={guidance.error} onClothes={() => void startClothes()} onSkip={() => void finish()} />
    return <SetupFlow household={current} created={made?.kind === 'created' || onboardingCelebration() === 'created'} pending={guidance.pending} error={guidance.error} onClothes={() => void startClothes()} onDone={() => void finish()} />
  }
  return <ChooseScreen onCreate={() => setStep('name')} onJoin={() => setStep('join')} />
}
