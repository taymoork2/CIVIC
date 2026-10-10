import { renderToStaticMarkup } from '@/test/markup'
import type { ReactElement } from 'react'
import { expect, test, vi } from 'vitest'
import { getFunctionName } from 'convex/server'

import { FirstRun, firstName, firstRunArgs, householdNameFor } from '@/account/first-run'
import { JoinWithCode } from '@/account/join-flow'
import { ChooseScreen, NextStepsScreen, NameScreen, SetupFlow, SetupScreen } from '@/account/onboarding-screens'
import { beginOnboarding, endOnboarding } from '@/account/onboarding-state'
import { Route as SetupRoute } from '@/routes/setup'
import type { CurrentHousehold } from '@/account/account'
import { assertPlainCopy } from '@/kit/test-copy'
import { BottleSheet } from '@/products/bottle-sheet'
import { MachineSheet } from '@/household/machine-sheet'
import { InviteFlow, InviteSheet, invitablePeople, liveInvite, madeInvites } from '@/household/household-invite'

vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('convex/react')>()),
  useMutation: () => async () => undefined,
  useQuery: (query: Parameters<typeof getFunctionName>[0]) => getFunctionName(query) === 'households:pendingInvites' ? hooks.invites : hooks.inventory ?? { machines: [], supplies: [], textiles: [], wearers: [] },
}))

/**
 * No DOM here, so step-to-step behavior calls FirstRun as a plain function: its state hooks keep
 * their slots between calls, and each step comes back as an element whose props the test drives.
 */
const hooks = vi.hoisted(() => ({ active: false, index: 0, slots: [] as unknown[], calls: [] as unknown[], destinations: [] as unknown[], fail: false, inventory: undefined as Record<string, unknown> | undefined, invites: [] as Array<{ inviteId: string; name: string; wearerId?: string; expiresAt: number }> }))
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>()
  return {
    ...real,
    useState: ((initial: unknown) => {
      if (!hooks.active) return real.useState(initial)
      const slot = hooks.index++
      if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [hooks.slots[slot], (next: unknown) => { hooks.slots[slot] = typeof next === 'function' ? (next as (value: unknown) => unknown)(hooks.slots[slot]) : next }]
    }) as typeof real.useState,
    useEffect: ((...args: Parameters<typeof real.useEffect>) => hooks.active ? undefined : real.useEffect(...args)) as typeof real.useEffect,
  }
})
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const real = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...real, useNavigate: (() => hooks.active ? (destination: unknown) => { hooks.destinations.push(destination); return Promise.resolve() } : real.useNavigate()) as typeof real.useNavigate }
})
vi.mock('@/kit/ui', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/kit/ui')>()
  return { ...real, useConvexCall: ((...args: Parameters<typeof real.useConvexCall>) => hooks.active ? { run: async (value: unknown) => { hooks.calls.push(value); return hooks.fail ? undefined : {} }, pending: false, error: null } : real.useConvexCall(...args)) as typeof real.useConvexCall }
})

// The props of whichever step FirstRun shows; each call is one render.
function step(props: Parameters<typeof FirstRun>[0]): ReactElement<Record<string, never>> {
  hooks.active = true
  hooks.index = 0
  try {
    return FirstRun(props) as ReactElement<Record<string, never>>
  } finally {
    hooks.active = false
  }
}

test('the household is named quietly after the person, never after an email address', () => {
  expect(firstName('  Taymoor Khan ')).toBe('Taymoor')
  expect(firstName('pat@example.com')).toBeNull()
  expect(firstName('')).toBeNull()
  expect(firstName(null)).toBeNull()
  expect(householdNameFor('Taymoor Khan')).toBe('Taymoor’s home')
  expect(householdNameFor('pat@example.com')).toBe('Home')
  expect(householdNameFor(undefined)).toBe('Home')
})

test('first run creates the household with only the person; others are added from Household', () => {
  expect(firstRunArgs('Taymoor Khan')).toEqual({
    name: 'Taymoor’s home',
    displayName: 'Taymoor Khan',
    wearers: [{ name: 'Taymoor', kind: 'adult', self: true }],
  })
  expect(firstRunArgs('pat@example.com', 'Our flat')).toEqual({ name: 'Our flat', wearers: [{ name: 'Me', kind: 'adult', self: true }] })
})

test('first run starts with create or join, invite link first', () => {
  const markup = renderToStaticMarkup(<FirstRun displayName="Taymoor" />)
  expect(markup).toContain('Your household')
  expect(markup).toContain('Create a household')
  expect(markup).toContain('Join a household')
  expect(markup).toContain('Use an invite link or code')
  expect(markup).not.toContain('Sign out')
  assertPlainCopy(markup)
})

test('naming the household suggests a name and keeps Back', () => {
  const markup = renderToStaticMarkup(<FirstRun displayName="Taymoor" initialStep="name" />)
  expect(markup).toContain('Name it')
  expect(markup).toContain('Household name')
  expect(markup).toContain('Taymoor’s home')
  expect(markup).toContain('Create household')
  assertPlainCopy(markup)
})

test('typed household name and invite code survive Back and the other path', () => {
  hooks.slots = []
  const at = (expected: unknown) => {
    const shown = step({ displayName: 'Taymoor' })
    expect(shown.type).toBe(expected)
    return shown.props as Record<string, (...args: unknown[]) => void> & { value?: string; initialCode?: string }
  }
  at(ChooseScreen).onCreate!()
  const named = at(NameScreen)
  expect(named.value).toBe('Taymoor’s home')
  named.onChange!('Lake house')
  expect(at(NameScreen).value).toBe('Lake house')
  at(NameScreen).onBack!()
  at(ChooseScreen).onJoin!()
  const joining = at(JoinWithCode)
  expect(joining.initialCode).toBe('')
  joining.onCodeChange!('AB12')
  at(JoinWithCode).onBack!()
  at(ChooseScreen).onCreate!()
  const back = at(NameScreen)
  expect(back.value).toBe('Lake house')
  // An emptied name stays empty; the suggestion appears only before any edit.
  back.onChange!('')
  expect(at(NameScreen).value).toBe('')
  at(NameScreen).onBack!()
  at(ChooseScreen).onJoin!()
  expect(at(JoinWithCode).initialCode).toBe('AB12')
})

test('/setup and Replay open household setup, including legacy intent guidance', () => {
  const validate = SetupRoute.options.validateSearch as (search: Record<string, unknown>) => { replay?: true }
  expect(validate({})).toEqual({})
  expect(validate({ replay: 'nope' })).toEqual({})
  expect(validate({ replay: true })).toEqual({ replay: true })
  const household = { householdId: 'h1', name: 'Home', washPlace: null, guidance: { status: 'started', stage: 'intent', updatedAt: 0 } } as unknown as CurrentHousehold
  hooks.slots = []
  expect(step({ displayName: null, household }).type).toBe(SetupFlow)
  hooks.slots = []
  expect(step({ displayName: null, household, initialStep: 'setup' }).type).toBe(SetupFlow)
})

test('the products and machines rows open their editors over the checklist and close back to it', () => {
  hooks.slots = []
  const household = { householdId: 'h1', name: 'Home', washPlace: 'home' } as Parameters<typeof SetupFlow>[0]['household']
  const render = () => {
    hooks.active = true
    hooks.index = 0
    try {
      return SetupFlow({ household, onDone: () => undefined, onClothes: () => undefined }) as ReactElement<{ onProducts: () => void; onMachines: () => void; children: ReactElement[] }>
    } finally {
      hooks.active = false
    }
  }
  const opened = (type: unknown) => render().props.children.flat().filter((child) => (child as ReactElement | null)?.type === type) as ReactElement<{ onClose: () => void }>[]
  expect(opened(BottleSheet)).toHaveLength(0)
  render().props.onProducts()
  const [bottle] = opened(BottleSheet)
  expect(bottle).toBeDefined()
  bottle!.props.onClose()
  expect(opened(BottleSheet)).toHaveLength(0)
  // With no home appliances yet, the row opens a new appliance sheet; nothing is created by the tap.
  render().props.onMachines()
  const [machine] = opened(MachineSheet)
  expect(machine).toBeDefined()
  machine!.props.onClose()
  expect(opened(MachineSheet)).toHaveLength(0)
})

test('a new household combines success with setup; a joiner gets an optional closet prompt', () => {
  const at = (role: 'owner' | 'member') => {
    hooks.slots = []
    const household = { householdId: 'h1', name: 'Home', washPlace: null, role, guidance: { status: 'started', stage: 'intent', updatedAt: 0 } } as unknown as CurrentHousehold
    return step({ displayName: null, household, initialStep: 'setup' })
  }
  expect(at('member').type).toBe(NextStepsScreen)
  expect(at('member').props.onInvite).toBeUndefined()
  expect(at('owner').type).toBe(SetupFlow)
  beginOnboarding('created')
  const household = { householdId: 'h1', name: 'Home', washPlace: null, role: 'owner' } as unknown as CurrentHousehold
  hooks.slots = []
  const created = step({ displayName: null, household })
  expect(created.type).toBe(SetupFlow)
  expect(created.props.created).toBe(true)
  endOnboarding()
  const noop = () => undefined
  const markup = renderToStaticMarkup(<NextStepsScreen onClothes={noop} onSkip={noop} />)
  expect(markup).toContain('Add clothes?')
  expect(markup).toContain('Skip for now')
  expect(markup).not.toContain('Invite your household')
  expect(markup).not.toContain('What would help today?')
})

test('setup contains only location, machines and products; invites return to a skippable closet prompt', () => {
  hooks.slots = []
  const onDone = vi.fn()
  const onClothes = vi.fn()
  const household = { householdId: 'h1', name: 'Home', washPlace: null } as Parameters<typeof SetupFlow>[0]['household']
  const render = () => {
    hooks.active = true
    hooks.index = 0
    try { return SetupFlow({ household, onDone, onClothes, created: true }) as ReactElement<Record<string, unknown>> }
    finally { hooks.active = false }
  }
  const setup = render() as unknown as ReactElement<Parameters<typeof SetupScreen>[0]>
  const markup = renderToStaticMarkup(setup)
  expect(markup).toContain('Where you wash')
  expect(markup).toContain('Machines')
  expect(markup).toContain('Products')
  expect(markup).toContain('Household created')
  expect(markup).not.toContain('Your first garment')
  expect(markup).not.toContain('Invite your household')
  expect(markup).not.toContain('Finish later')
  setup.props.onDone()
  const choices = () => (render().props.children as ReactElement[])[0] as ReactElement<Parameters<typeof NextStepsScreen>[0]>
  const nextMarkup = renderToStaticMarkup(choices())
  expect(nextMarkup).toContain('>Add clothes<')
  expect(nextMarkup).not.toContain('Add clothes to the hamper')
  choices().props.onInvite!()
  const invite = (render().props.children as ReactElement[])[1] as ReactElement<Parameters<typeof InviteFlow>[0]>
  expect(invite.type).toBe(InviteFlow)
  invite.props.onClose()
  expect(choices().props.onInvite).toBeUndefined()
  choices().props.onClothes()
  expect(onClothes).toHaveBeenCalledOnce()
  choices().props.onSkip()
  expect(onDone).toHaveBeenCalledOnce()
})

test('closet and skip exits save guidance first; a failed save keeps onboarding open', async () => {
  const household = { householdId: 'h1', name: 'Home', washPlace: null, role: 'member' } as unknown as CurrentHousehold
  hooks.slots = []
  hooks.calls = []
  hooks.destinations = []
  const shown = step({ displayName: null, household, initialStep: 'setup' }) as unknown as ReactElement<Parameters<typeof NextStepsScreen>[0]>
  shown.props.onClothes()
  await vi.waitFor(() => expect(hooks.destinations).toEqual([{ to: '/closet', search: { add: 'choose' } }]))
  expect(hooks.calls[0]).toEqual({ householdId: 'h1', command: 'start', stage: 'clothes' })
  hooks.destinations = []
  hooks.fail = true
  shown.props.onSkip()
  await Promise.resolve()
  await Promise.resolve()
  expect(hooks.destinations).toEqual([])
  hooks.fail = false
  shown.props.onSkip()
  await vi.waitFor(() => expect(hooks.destinations).toEqual([{ to: '/' }]))
  expect(hooks.calls.at(-1)).toEqual({ householdId: 'h1', command: 'dismiss' })
})

test('a complete household offers the same add-clothes and invite choices', () => {
  hooks.slots = []
  hooks.inventory = { machines: [{ applianceType: 'front_load_washer', name: 'Washer', location: 'home', archived: false }], supplies: [{ archived: false }], textiles: [], wearers: [] }
  const household = { householdId: 'h1', name: 'Home', washPlace: 'home' } as Parameters<typeof SetupFlow>[0]['household']
  const props = { household, onDone: () => undefined, onClothes: () => undefined }
  const render = () => {
    hooks.active = true
    hooks.index = 0
    try { return SetupFlow(props) as ReactElement<Record<string, unknown>> }
    finally { hooks.active = false }
  }
  try {
    const setup = render() as unknown as ReactElement<Parameters<typeof SetupScreen>[0]>
    setup.props.onDone()
    const choices = (render().props.children as ReactElement[])[0] as ReactElement<Parameters<typeof NextStepsScreen>[0]>
    expect(choices.props.onInvite).toBeTypeOf('function')
    expect(choices.props.onClothes).toBe(props.onClothes)
    expect(renderToStaticMarkup(choices)).not.toContain('Add clothes to the hamper')
  } finally { hooks.inventory = undefined }
})

test('an invite is for a person: the sheet names them, and "Who is this for?" lists only unclaimed people', () => {
  const sheet = renderToStaticMarkup(<InviteSheet householdName="Home" personName="Sam" invite={{ code: 'ABCD-EFGH-JKLM-NPQR', expiresAt: Date.UTC(2026, 9, 14) }} pending={false} error={null} onNew={() => undefined} onClose={() => undefined} />)
  expect(sheet).toContain('Invite Sam')
  expect(sheet).toContain('with Sam’s closet as their own')
  const wearers = [
    { wearerId: 'w1', name: 'Pat', kind: 'adult', principalKey: 'pat' },
    { wearerId: 'w2', name: 'Sam', kind: 'child', principalKey: null },
    { wearerId: 'w3', name: 'Baby Lou', kind: 'baby', principalKey: null },
  ] as unknown as Parameters<typeof InviteFlow>[0]['wearers']
  expect(invitablePeople(wearers).map((wearer) => wearer.name)).toEqual(['Sam'])
  const who = renderToStaticMarkup(<InviteFlow householdId={'h1' as CurrentHousehold['householdId']} householdName="Home" wearers={wearers} onClose={() => undefined} />)
  expect(who).toContain('Who is this for?')
  expect(who).toContain('Sam')
  expect(who).toContain('Someone new')
  expect(who).not.toContain('Pat')
  expect(who).not.toContain('Baby Lou')
  // Nobody left to claim: straight to naming someone new.
  expect(renderToStaticMarkup(<InviteFlow householdId={'h1' as CurrentHousehold['householdId']} householdName="Home" wearers={wearers.slice(0, 1)} onClose={() => undefined} />)).toContain('What’s their name?')
})

test('opening an invite again shows the unused link; a new link, which stops the old one, takes a tap', () => {
  const sam = { wearerId: 'w2', name: 'Sam' } as unknown as NonNullable<Parameters<typeof InviteFlow>[0]['person']>
  const flow = () => renderToStaticMarkup(<InviteFlow householdId={'h1' as CurrentHousehold['householdId']} householdName="Home" wearers={[]} person={sam} onClose={() => undefined} />)
  madeInvites.clear()
  // No link yet (or one from before a reload): nothing is made until "Make invite link", which says what it replaces.
  const fresh = flow()
  expect(fresh).toContain('Make invite link')
  expect(fresh).toContain('They join as a member, with Sam’s closet as their own.')
  madeInvites.set('w2', { inviteId: 'i2' as import('@convex/_generated/dataModel').Id<'householdInvites'>, code: 'ABCD-EFGH-JKLM-NPQR', expiresAt: Date.now() + 60_000 })
  hooks.invites = [{ inviteId: 'i2', name: 'Sam', wearerId: 'w2', expiresAt: madeInvites.get('w2')!.expiresAt }]
  const again = flow()
  expect(again).toContain('ABCD-EFGH-JKLM-NPQR')
  expect(again).toContain('Replace link')
  expect(again).not.toContain('A new link stops this one working.')
  hooks.invites = [{ ...hooks.invites[0]!, inviteId: 'replacement' }]
  expect(flow()).not.toContain('ABCD-EFGH-JKLM-NPQR')
  hooks.invites = []
  expect(flow()).not.toContain('ABCD-EFGH-JKLM-NPQR')
  expect(liveInvite('w2', Date.now() + 120_000)).toBeNull()
  madeInvites.clear()
})
