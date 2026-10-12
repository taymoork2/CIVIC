import type { CSSProperties, ReactNode } from 'react'

import '@/styles/account-motion.css'

/**
 * The still lifes are transparent landscape assets. Each is contained inside a fixed-height frame,
 * so it is never cropped or stretched. `width` is how much of the column it may fill, `y` where the
 * picture rests in the frame, and `height` the frame's height (all as in the prototype's art()).
 */
const views = {
  signin: { width: 100, y: '55%', height: 172, asset: 'signin-warm', alt: 'Illustration: freshly folded ivory, blue and sage clothes in a warm woven laundry basket' },
  register: { width: 90, y: '70%', height: 180, asset: 'register', alt: 'Illustration: an outfit of a folded ivory tee, blue jeans and socks' },
  household: { width: 96, y: '75%', height: 172, asset: 'household', alt: 'Illustration: two laundry baskets with ivory, sage and blue clothes' },
  name: { width: 82, y: '70%', height: 152, asset: 'household', alt: 'Illustration: two laundry baskets with ivory, sage and blue clothes' },
  setup: { width: 76, y: '70%', height: 132, asset: 'setup', alt: 'Illustration: a washer and dryer with a folded towel and detergent bottle' },
  join: { width: 90, y: '70%', height: 172, asset: 'join', alt: 'Illustration: folded ivory, blue and sage clothes in an open wooden wardrobe drawer' },
  invite: { width: 100, y: '50%', height: 144, asset: 'join', alt: 'Illustration: folded ivory, blue and sage clothes in an open wooden wardrobe drawer' },
  welcome: { width: 96, y: '60%', height: 200, asset: 'welcome', alt: 'Illustration: freshly folded clothes beside a woven laundry basket' },
} as const

export type WelcomeArtView = keyof typeof views

/** Still artwork follows the canonical no-idle-motion rule; children supply earned celebrations. */
export function WelcomeArt({ view, faded = false, children }: { view: WelcomeArtView; faded?: boolean; children?: ReactNode }) {
  const { width, y, height, asset, alt } = views[view]
  const frame: CSSProperties = { height }
  const picture: CSSProperties = { width: `${width}%`, height: '100%', objectFit: 'contain', objectPosition: `50% ${y}` }
  return <div className="relative w-full" style={frame} data-welcome-art={view}>
    <div aria-hidden="true" className="absolute inset-x-[6%] top-[10%] bottom-0 rounded-[50%] [background:radial-gradient(closest-side,var(--accent-container),transparent)]" />
    <div className="absolute inset-0 flex justify-center">
      <img className={faded ? 'opacity-55' : undefined} src={`/welcome-${asset}.webp`} alt={alt} decoding="async" draggable={false} style={picture} />
    </div>
    {children}
  </div>
}
