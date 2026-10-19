import { useEffect, useEffectEvent } from 'react'
import { projectShortcut } from './project-choice'

/** Shell shortcuts also work while a same-origin preview has keyboard focus. */
export function useWorkspaceShortcut(key: 'k' | ',', callback: (event: KeyboardEvent) => void, frame: HTMLIFrameElement | null) {
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (projectShortcut(event, key)) callback(event)
  })
  useEffect(() => { window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut) }, [])
  useEffect(() => {
    let win: Window | null = null
    const unbind = () => { try { win?.removeEventListener('keydown', shortcut, true) } catch {} win = null }
    const bind = () => { unbind(); try { win = frame?.contentWindow ?? null; win?.addEventListener('keydown', shortcut, true) } catch {} }
    bind(); frame?.addEventListener('load', bind)
    return () => { unbind(); frame?.removeEventListener('load', bind) }
  }, [frame])
}
