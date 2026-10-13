// Copied from @fluentui/react-card 9.7.3 so the promotion card can show a full-bleed
// illustration above its header. A CIVIC stand-in for a vendored copy, not Fluent's source.
import type { ReactNode } from 'react'

export function Card({ illustration, children }: { illustration?: ReactNode; children: ReactNode }) {
  return (
    <div className="fui-Card shop-promo-card" role="group">
      {illustration ? <div className="shop-promo-card__illustration">{illustration}</div> : null}
      {children}
    </div>
  )
}
