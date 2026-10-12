import { v } from 'convex/values'

import { query } from './_generated/server'

export const status = query({
  args: {},
  returns: v.object({ status: v.literal('ok') }),
  handler: () => ({ status: 'ok' as const }),
})
