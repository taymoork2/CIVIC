import type { FunctionReturnType } from 'convex/server'

import type { api } from '@/api'

/** Household inventory exactly as `inventory.list` returns it. */
export type Inventory = FunctionReturnType<typeof api.inventory.list>
export type Textile = Inventory['textiles'][number]
/** A reviewed owner choice changes a route, never the stored label. */
export const effectiveWashMethod = (textile: Textile) => textile.personalRoutine?.current ? textile.personalRoutine.settings.wash?.method ?? textile.care?.washMethod : textile.care?.washMethod
/** An earlier stain treatment in words: what someone typed, or the product the app recorded. */
export const attemptName = (entry: string | { readonly name: string }) => typeof entry === 'string' ? entry : entry.name
export type Care = NonNullable<Textile['care']>
export type Supply = Inventory['supplies'][number]
export type Rule = Supply['rules'][number]
export type Machine = Inventory['machines'][number]
