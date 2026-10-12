import type { MountAdapter } from '../adapter'

// Laundry owns these presenters and simulated operations; the generic host never imports them.
export const mount: MountAdapter = async () => { await import('../laundry-frame') }
