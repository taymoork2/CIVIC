import type { Effect } from 'effect'
import type { WebSocket } from 'ws'

export declare const frameLimit: number
export declare function clientPresence(changed: (count: number) => void, now?: () => number): {
  issue: (binding: string) => Effect.Effect<string>
  consume: (ticket: string, binding: string) => Effect.Effect<boolean>
  revokeTickets: () => void
  attach: (socket: WebSocket) => { id: string; generation: string }
  heartbeat: () => void
  broadcast: (event: { type: 'status'; state: string } | { type: 'invalidate'; run: string }) => void
  close: () => void
}
