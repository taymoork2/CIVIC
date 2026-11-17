import { initTRPC } from '@trpc/server'
import { createTRPCRouter, router as makeRouter } from './trpc'
import { router } from 'another-library'

const t = initTRPC.context<Context>().create()
const users = t.router({
  byId: t.procedure.input(schema).query(() => null),
  save: t.procedure.mutation(() => null),
})
export const appRouter = createTRPCRouter({
  user: users,
  events: makeRouter({ latest: t.procedure.subscription(() => null) }),
  [dynamic]: t.procedure.query(() => null),
  ...imported,
})
export const unrelated = router({ nope: other.query(() => null) })
// const fake = t.router({ fake: t.procedure.query(() => null) })
