import type { ReactNode } from 'react'

export function SelectablePath({ id, action, description, d, hitD = d, selected, disabled, select, children }: { id: string; action: string; description?: string; d: string; hitD?: string; selected: boolean; disabled: boolean; select: () => void; children: ReactNode }) {
  return <g data-path-id={id} className={`rh-selectable-path ${selected ? 'is-selected' : ''}`} role="button" tabIndex={disabled ? -1 : 0} aria-label={`Review path: ${action}`} aria-description={description} aria-pressed={selected} aria-disabled={disabled} onClick={(event) => { if (!disabled) { event.stopPropagation(); select() } }} onKeyDown={(event) => {
    if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); select() }
  }}>
    <title>{action}{description ? ` · ${description}` : ''}</title>{selected && <path d={d} className="rh-path-selection" fill="none" stroke="#2456d6" strokeWidth="7" vectorEffect="non-scaling-stroke" />}
    {children}<path className="rh-path-hit" d={hitD} fill="none" stroke="transparent" strokeWidth="20" vectorEffect="non-scaling-stroke" />
  </g>
}
