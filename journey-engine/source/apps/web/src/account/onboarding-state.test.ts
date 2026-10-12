import { expect, test } from 'vitest'
import { beginOnboarding, endOnboarding, finishOnboardingCelebration, guidanceAction, guidanceDestination, onboardingCelebration } from '@/account/onboarding-state'

test('guidance resumes its saved task instead of restarting the intent chooser', () => {
  expect(guidanceDestination('laundry')).toEqual({ to: '/laundry' })
  expect(guidanceDestination('clothes')).toEqual({ to: '/closet', search: { add: 'choose' } })
  expect(guidanceDestination('household')).toEqual({ to: '/household' })
  for (const stage of ['intent', 'setup'] as const) expect(guidanceDestination(stage)).toEqual({ to: '/setup' })
})

test('Home names the unfinished task, and an unchosen start resumes at the checklist rather than the chooser', () => {
  const started = (stage: 'intent' | 'setup' | 'household' | 'clothes' | 'laundry') => guidanceAction({ status: 'started', stage }, 'calm')
  expect(started('intent')).toEqual({ kind: 'resume', label: 'Finish setup', stage: 'setup' })
  expect(started('setup')).toEqual({ kind: 'resume', label: 'Finish setup', stage: 'setup' })
  expect(started('household')).toEqual({ kind: 'resume', label: 'Finish household setup', stage: 'household' })
  expect(started('clothes')).toEqual({ kind: 'resume', label: 'Continue adding clothes', stage: 'clothes' })
  expect(started('laundry')).toEqual({ kind: 'resume', label: 'Continue your first wash', stage: 'laundry' })
  expect(guidanceAction({ status: 'dismissed', stage: 'clothes' }, 'first')).toEqual({ kind: 'resume', label: 'Continue adding clothes', stage: 'clothes' })
})

test('Resume is hidden while the hero leads with a care task, after a setup dismissal, and before guidance starts', () => {
  for (const scene of ['planned', 'blocked', 'running', 'finished', 'drying', 'hamper']) expect(guidanceAction({ status: 'started', stage: 'laundry' }, scene)).toBeNull()
  for (const stage of ['intent', 'setup'] as const) expect(guidanceAction({ status: 'dismissed', stage }, 'first')).toBeNull()
  expect(guidanceAction({ status: 'not_started', stage: 'intent' }, 'first')).toBeNull()
  expect(guidanceAction(undefined, 'first')).toBeNull()
})

test('completed guidance offers only Replay, whatever the hero shows', () => {
  for (const scene of ['calm', 'running']) expect(guidanceAction({ status: 'completed', stage: 'laundry' }, scene)).toEqual({ kind: 'replay', label: 'Replay first-load guidance' })
})

test('household creation and joining retain their celebration until its explicit exit', () => {
  for (const kind of ['created', 'joined'] as const) {
    beginOnboarding(kind)
    expect(onboardingCelebration()).toBe(kind)
    expect(onboardingCelebration()).toBe(kind)
    finishOnboardingCelebration()
    expect(onboardingCelebration()).toBeNull()
    endOnboarding()
    expect(onboardingCelebration()).toBeNull()
  }
  beginOnboarding('created')
  endOnboarding()
  expect(onboardingCelebration()).toBeNull()
})
