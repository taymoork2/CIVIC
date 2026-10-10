import type { ReactNode } from 'react'
import { WelcomeArt } from '@/kit/welcome-art'
import { appText } from '@/copy'

// Enlarged text grows the words, without consuming the drawer with enlarged empty gutters.
export const invitationSheetClassName = '[&.sheet_.sheet-head]:p-[28px_80px_12px_24px] [&.sheet_.sheet-body]:p-[8px_24px_20px] [&.sheet.has-compact-actions_.sheet-foot]:p-[12px_24px_max(24px,env(safe-area-inset-bottom))] [&.sheet_.sheet-close-icon]:size-[44px] [&.sheet_.sheet-close-icon]:min-w-[44px] [&.sheet_.sheet-close-icon]:min-h-[44px] [&.sheet_.sheet-close-icon]:top-[12px] [&.sheet_.sheet-close-icon]:end-[16px]'

/** The same household invitation, whether someone is sharing it or deciding to join. */
export function HouseholdInvitation({ name, children }: { name: string; children: ReactNode }) {
  return <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center gap-2 rounded-card bg-surface-2 px-[16px] pt-[20px] pb-[16px] text-center">
    <p className="m-0 text-[length:var(--step--1)] text-ink-2">{appText.tabs.household}</p>
    <h2 className="m-0 max-w-full text-[length:var(--step-1)] font-semibold leading-tight text-balance [overflow-wrap:anywhere]">{name}</h2>
    <WelcomeArt view="invite" />
    <div className="grid min-w-0 max-w-full gap-1 text-[length:var(--step--1)] leading-normal text-ink-2 [overflow-wrap:anywhere]">{children}</div>
  </section>
}
