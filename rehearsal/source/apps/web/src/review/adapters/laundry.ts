import type { MountAdapter } from '@civic/canvas/adapter'

// Laundry owns these presenters and simulated operations; the generic host never imports them.
export const mount: MountAdapter = async (container, context) => {
  if (context.scenario.id.startsWith('intake.towel.')) {
    const { mountTowelRuntime } = await import('./laundry-towel')
    return mountTowelRuntime(container, context)
  }
  if (context.scenario.renderer === 'runtime') {
    const { mountLaundryRuntime } = await import('./laundry-runtime')
    return mountLaundryRuntime(container, context)
  }
  await import('../laundry-frame')
}
