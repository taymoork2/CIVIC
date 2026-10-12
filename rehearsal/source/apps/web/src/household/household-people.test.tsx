import { renderToStaticMarkup } from '@/test/markup'
import { expect, test, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import type { CurrentHousehold } from '@/account/account'
import type { Inventory } from '@/household/inventory-types'
import { Members } from '@/household/household-people'
import { MembersView, WearerEditorView, WearerSheetView } from '@/household/household-people'

const state = vi.hoisted(() => ({ members: [] as Array<{ membershipId: string; displayName: string; role: 'owner' | 'member'; isYou: boolean; wearerId: string | null }> }))
vi.mock('convex/react', async (original) => ({
  ...await original<typeof import('convex/react')>(),
  useQuery: (query: Parameters<typeof getFunctionName>[0]) => getFunctionName(query) === 'households:pendingInvites' ? [] : state.members,
  useMutation: () => async () => null,
}))

const household = { householdId: 'home', name: 'Home', role: 'owner', washPlace: 'home', firstHamperNotePending: false } as CurrentHousehold
const wearers = [{ wearerId: 'pat', name: 'Pat', kind: 'adult', principalKey: null }] as Inventory['wearers']

test('saved profiles show recorded facts and one header edit; new profiles start in the form', () => {
  const wearer = { ...wearers[0]!, requirements: { fragranceFree: true, dyeFree: false, avoidIngredients: ['lanolin'], acceptedSupplyIds: ['known'] } } as Inventory['wearers'][number]
  const supplies = [{ supplyId: 'known', name: 'Known product' }] as Inventory['supplies']
  const render = (person: typeof wearer | null) => renderToStaticMarkup(<WearerSheetView wearer={person} supplies={supplies} onSave={async () => false} onClose={() => {}} />)
  const saved = render(wearer)
  expect(saved).toContain('aria-label="Edit clothing profile"')
  expect(saved).toContain('Fragrance-free only')
  expect(saved).toContain('lanolin')
  expect(saved).toContain('Known product')
  expect(saved).not.toMatch(/<form|Dye-free only|Linked to an account|has an account|Save person/)
  const added = render(null)
  expect(added).toContain('<form')
  expect(added).toContain('Save person')
  expect(added).not.toContain('aria-label="Edit clothing profile"')
})

test('People separates household membership from clothes ownership, with Invite last among members', () => {
  state.members = [
    { membershipId: 'owner', displayName: 'Pat', role: 'owner', isYou: true, wearerId: null },
    { membershipId: 'member', displayName: 'Alex', role: 'member', isYou: false, wearerId: null },
  ]
  const markup = renderToStaticMarkup(<Members household={household} wearers={wearers} />)
  expect(markup).toContain('Household members')
  expect(markup).toContain('Whose clothes')
  expect(markup).toContain('aria-label="Open Pat. Adult"')
  expect(markup).toContain('Pat (you)')
  expect(markup).toContain('Owner')
  expect(markup).toContain('Household member')
  expect(markup).not.toContain('>Remove</button>')
  expect(markup).toContain('aria-label="Open Alex. Household member"')
  expect(markup).toContain('Invite someone')
  expect(markup.indexOf('Alex')).toBeLessThan(markup.indexOf('Invite someone'))
  expect(markup.indexOf('Invite someone')).toBeLessThan(markup.indexOf('Whose clothes'))
  expect(markup).not.toContain('>Leave</button>')
})

test('a sole remaining non-owner still has a way to leave and cannot invite others', () => {
  state.members = [{ membershipId: 'member', displayName: 'Alex', role: 'member', isYou: true, wearerId: null }]
  const markup = renderToStaticMarkup(<Members household={{ ...household, role: 'member' }} wearers={[]} />)
  expect(markup).toContain('Alex (you)')
  expect(markup).not.toContain('>Leave</button>')
  expect(markup).toContain('aria-label="Open Alex. Household member"')
  expect(markup).not.toContain('Invite someone')
  expect(markup).toContain('Add clothing profile')
})

test('members and linked profiles share a row by ID, while same-name and retained profiles stay separate', () => {
  state.members = [{ membershipId: 'owner', displayName: 'Pat Account', role: 'owner', isYou: true, wearerId: 'linked' }]
  const linked = { ...wearers[0]!, wearerId: 'linked', name: 'Clothing name', principalKey: 'pat-account' } as Inventory['wearers'][number]
  const render = (profiles: Inventory['wearers']) => renderToStaticMarkup(<Members household={household} wearers={profiles} />)
  const markup = render([linked, wearers[0]!])
  expect(markup).toContain('Pat Account (you)')
  expect(markup).toContain('aria-label="Open Clothing name. Clothing preferences"')
  expect(markup).toContain('aria-label="Open Pat. Adult"')
  expect(markup).not.toContain('has an account')
  expect(markup).not.toContain('>Clothing name</span>')
  expect(render([linked])).not.toContain('Whose clothes')
  expect(render([{ ...linked, principalKey: null }])).toContain('aria-label="Open Clothing name. Adult"')
  expect(render([])).toContain('Pat Account (you)')
})

test('pending clothing-profile saves freeze native fields and checkbox controls without changing values', () => {
  const wearer = {
    ...wearers[0]!,
    requirements: { fragranceFree: true, dyeFree: false, avoidIngredients: ['lanolin', 'optical brighteners'], acceptedSupplyIds: ['accepted'] },
  } as Inventory['wearers'][number]
  const supplies = [
    { supplyId: 'accepted', name: 'Known product', kind: 'chemical', archived: false },
    { supplyId: 'other', name: 'Other product', kind: 'chemical', archived: false },
    { supplyId: 'archived', name: 'Archived product', kind: 'chemical', archived: true },
    { supplyId: 'device', name: 'Dispenser', kind: 'dispensing_device', archived: false },
    { supplyId: 'ball', name: 'Dryer ball', kind: 'wool_dryer_ball', archived: false },
  ] as Inventory['supplies']
  const render = (pending: boolean) => renderToStaticMarkup(<WearerEditorView wearer={wearer} supplies={supplies} pending={pending} onSave={async () => false} onClose={() => {}} />)
  const idle = render(false)
  const pending = render(true)
  const fields = pending.match(/<form\b[^>]*>\s*<fieldset\b([^>]*)>([\s\S]*)<\/fieldset>/)!
  expect(fields, 'All editable fields must share the native disabled fieldset').not.toBeNull()
  expect(fields[1]).toContain('disabled=""')
  expect(fields[2].match(/<input\b/g)).toHaveLength(6)
  expect(fields[2].match(/role="tab"/g)).toHaveLength(2)
  expect(fields[2]).toContain('Profile editor sections')
  const checkboxes = fields[2].match(/<span\b[^>]*role="checkbox"[^>]*>/g)!
  expect(checkboxes).toHaveLength(4)
  for (const checkbox of checkboxes) {
    expect(checkbox).toContain('aria-disabled="true"')
    expect(checkbox).toContain('tabindex="-1"')
  }
  const checkboxInputs = fields[2].match(/<input\b[^>]*>/g)!.filter((input) => input.includes('type="checkbox"'))
  expect(checkboxInputs).toHaveLength(4)
  for (const input of checkboxInputs) expect(input).toContain('disabled=""')
  for (const markup of [idle, pending]) {
    expect(markup).toContain('value="Pat"')
    expect(markup).toContain('aria-pressed="true">lanolin</button>')
    expect(markup).toContain('aria-pressed="true">optical brighteners</button>')
    expect(markup).toContain('required="" maxLength="60"')
    expect(markup).toContain('maxLength="80"')
    expect(markup.match(/aria-checked="true"/g)).toHaveLength(2)
    expect(markup).not.toMatch(/Archived product|Dispenser|Dryer ball/)
  }
  expect(idle).not.toContain('aria-disabled="true"')
})

test('pending invite rows open invite management; plain and linked profiles remain editable', () => {
  const markup = renderToStaticMarkup(<MembersView role="owner" members={[]} wearers={wearers} invites={[{ inviteId: 'invite' as import('@convex/_generated/dataModel').Id<'householdInvites'>, name: 'Pat', wearerId: wearers[0]!.wearerId, expiresAt: Date.now() + 1000 }]} onInvite={() => {}} onEdit={() => {}} onEditMember={() => {}} />)
  expect(markup).toContain('Invite pending')
  expect(markup).toContain('aria-label="Manage invite for Pat"')
  expect(markup).toContain('aria-label="Open Pat.')
  expect(markup).toContain('Pending invitations')
  expect(markup.indexOf('Household members')).toBeLessThan(markup.indexOf('Whose clothes'))
  expect(markup.indexOf('Whose clothes')).toBeLessThan(markup.indexOf('Pending invitations'))
  expect(markup).not.toContain('>Link account</button>')
  const idle = renderToStaticMarkup(<WearerEditorView wearer={wearers[0]!} supplies={[]} onRemove={async () => false} onClose={() => {}} onSave={async () => false} />)
  expect(idle).toContain('>Remove person</button>')
  const linked = renderToStaticMarkup(<WearerEditorView wearer={{ ...wearers[0]!, principalKey: 'pat' }} supplies={[]} onClose={() => {}} onSave={async () => false} />)
  expect(linked).not.toContain('>Remove person</button>')
})

test('profile drawer contains account actions and freezes them during a save', () => {
  const render = (pending: boolean) => renderToStaticMarkup(<WearerEditorView wearer={wearers[0]!} supplies={[]} pending={pending} onLinkAccount={() => {}} onAccessAction={() => {}} onClose={() => {}} onSave={async () => false} />)
  for (const label of ['Link account', 'Remove access']) {
    expect(render(false)).toContain(`>${label}</button>`)
    expect(render(true)).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`))
  }
})
