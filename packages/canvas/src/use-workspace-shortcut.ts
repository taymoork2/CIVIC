import { projectShortcut } from './project-choice'
import { useWindowEvent } from '@civic/shell/use-window-event'
import { useFrameKeydown } from '@civic/shell/use-frame-keydown'

/** Shell shortcuts also work while a same-origin preview has keyboard focus. */
export function useWorkspaceShortcut(key: 'k' | ',', onShortcut: (event: KeyboardEvent) => void, frame: HTMLIFrameElement | null) {
  useWindowEvent('keydown', event => { if (projectShortcut(event, key)) onShortcut(event) })
  useFrameKeydown(frame, event => { if (projectShortcut(event, key)) onShortcut(event) })
}
