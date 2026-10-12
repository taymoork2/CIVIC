import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { clothingTags, garmentKey, matchesClothingSearch, materialCareProblem } from '@washcloset/planner'
import { query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { authorize, visible, type ReadCtx } from './access'
import { readInventory } from './inventory'
import { busyTextiles } from './plans'

const filters = {
  householdId: v.id('households'), search: v.string(),
  wearer: v.optional(v.union(v.id('wearers'), v.null())),
  section: v.union(v.literal('all'), v.literal('ready'), v.literal('care')),
  tags: v.array(v.string()),
}
type Filters = { householdId: Id<'households'>; search: string; wearer?: Id<'wearers'> | null; section: 'all' | 'ready' | 'care'; tags: string[] }

async function directory(ctx: ReadCtx, args: Filters, includeCare = args.search.trim() !== '') {
  const { actor } = await authorize(ctx, 'textile.read', args)
  const [rows, people, busy] = await Promise.all([
    ctx.db.query('textiles').withIndex('by_household', q => q.eq('householdId', args.householdId)).collect(),
    ctx.db.query('wearers').withIndex('by_household', q => q.eq('householdId', args.householdId)).collect(),
    busyTextiles(ctx, args.householdId),
  ])
  // shortcut: group/search metadata still scans the household; materialize it before scaling beyond the tested 1,000-piece households.
  const garments = (await visible(ctx, actor, rows)).filter(row => row.trashedAt === undefined && !row.guest)
  const wearers = await visible(ctx, actor, people)
  const names = new Map(wearers.map(person => [person._id, person.name]))
  const owner = (piece: Doc<'textiles'>) => piece.wearerId !== undefined && names.has(piece.wearerId) ? piece.wearerId : null
  const scoped = garments.filter(piece => args.wearer === undefined || owner(piece) === args.wearer)
  const careRows = includeCare ? await Promise.all(scoped.map(piece => ctx.db.query('care').withIndex('by_textile', q => q.eq('textileId', piece._id)).unique())) : []
  const care = new Map(scoped.map((piece, index) => [piece._id, careRows[index] ?? null]))
  const state = (piece: Doc<'textiles'>) => busy.has(piece._id) ? 'in_wash' : piece.status === 'clean' ? 'ready' : piece.status
  const groups = new Map<string, Doc<'textiles'>[]>()
  for (const piece of scoped) {
    if (args.section !== 'all' && (state(piece) === 'ready') !== (args.section === 'ready')) continue
    if (!args.tags.every(tag => clothingTags(piece).some(value => value.toLowerCase() === tag.toLowerCase()))) continue
    const key = JSON.stringify([garmentKey(piece), owner(piece)])
    const members = groups.get(key)
    if (members === undefined) groups.set(key, [piece])
    else members.push(piece)
  }
  const shown = [...groups.values()].filter(members => members.some(piece => matchesClothingSearch({ ...piece, care: care.get(piece._id) }, owner(piece) === null ? 'Shared' : names.get(owner(piece)!) ?? '', args.search)))
  const anchor = (piece: Doc<'textiles'>) => `${piece._creationTime.toFixed(6).padStart(24, '0')}:${piece._id}`
  shown.sort((a, b) => anchor(a[0]!).localeCompare(anchor(b[0]!)))
  return { garments, scoped, shown, care, busy, wearers, owner, state, anchor }
}

export const summary = query({
  args: filters,
  handler: async (ctx, args) => {
    const data = await directory(ctx, args, true)
    const { garments, scoped, shown, care, wearers, owner, state } = data
    const unknown = (piece: Doc<'textiles'>) => {
      const label = care.get(piece._id)
      return label == null || label.status !== 'confirmed' || materialCareProblem(label.material, label) !== null
    }
    const identities = new Map<string, Doc<'textiles'>[]>()
    for (const piece of scoped) {
      const key = JSON.stringify([garmentKey(piece), piece.kind ?? null, owner(piece)])
      const group = identities.get(key)
      if (group === undefined) identities.set(key, [piece]); else group.push(piece)
    }
    const only = identities.size === 1 ? [...identities.values()][0]! : null
    return {
      total: garments.length, matched: shown.reduce((sum, group) => sum + group.length, 0), groups: shown.length,
      tags: [...new Set(scoped.flatMap(piece => clothingTags(piece)))].sort(),
      people: [...wearers.map(person => ({ wearerId: person._id as Id<'wearers'> | null, count: garments.filter(piece => owner(piece) === person._id).length })), { wearerId: null, count: garments.filter(piece => owner(piece) === null).length }],
      counts: { ready: scoped.filter(piece => state(piece) === 'ready').length, hamper: scoped.filter(piece => state(piece) === 'dirty').length, laundry: scoped.filter(piece => ['in_wash', 'hanging'].includes(state(piece))).length, care: scoped.filter(piece => ['needs_refresh', 'needs_dry_clean', 'at_cleaner'].includes(state(piece))).length },
      facts: { garmentGroups: identities.size, pieces: scoped.length, only: only === null ? null : { textileId: only[0]!._id, name: only[0]!.name, pieces: only.length, careUnknown: only.some(unknown) } },
      readyGroups: new Set(scoped.filter(piece => state(piece) === 'ready').map(piece => JSON.stringify([garmentKey(piece), piece.kind, owner(piece)]))).size,
      needsCare: scoped.find(unknown)?._id ?? null,
    }
  },
})

/** Home needs one representative per group, never every piece in a multipack. */
export const readyPreview = query({
  args: { householdId: v.id('households') },
  handler: async (ctx, { householdId }) => {
    const { shown } = await directory(ctx, { householdId, search: '', section: 'ready', tags: [] })
    const groups = shown.slice(0, 6)
    const inventory = await readInventory(ctx, { householdId, textileIds: groups.map(group => group[0]!._id) })
    return inventory.textiles.map(textile => ({ textile, count: groups.find(group => group[0]!._id === textile.textileId)!.length }))
  },
})

export const page = query({
  args: { ...filters, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const data = await directory(ctx, args)
    // Boundaries are creation anchors, not offsets: insertions/removals cannot shift later pages.
    const start = args.paginationOpts.cursor
    const end = args.paginationOpts.endCursor
    const candidates = data.shown.filter(group => (start === null || data.anchor(group[0]!) > start) && (end == null || data.anchor(group[0]!) <= end))
    const groups = end == null ? candidates.slice(0, Math.min(40, Math.max(1, args.paginationOpts.numItems))) : candidates
    const last = groups.at(-1)?.[0]
    const continueCursor = end ?? (last === undefined ? start ?? '' : data.anchor(last))
    const inventory = await readInventory(ctx, { householdId: args.householdId, textileIds: groups.flatMap(group => group.map(piece => piece._id)) })
    return { page: inventory.textiles, continueCursor, isDone: end == null ? groups.length === candidates.length : !data.shown.some(group => data.anchor(group[0]!) > end), pageStatus: null, splitCursor: null }
  },
})

/** Deep links load their complete matching group even when it is beyond the current page. */
export const group = query({
  args: { householdId: v.id('households'), textileId: v.id('textiles') },
  handler: async (ctx, args) => {
    const data = await directory(ctx, { householdId: args.householdId, search: '', section: 'all', tags: [] })
    const group = data.shown.find(members => members.some(piece => piece._id === args.textileId)) ?? []
    return (await readInventory(ctx, { householdId: args.householdId, textileIds: group.map(piece => piece._id) })).textiles
  },
})
