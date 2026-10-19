import type { RuntimeBridge, RuntimeComponent, RuntimeGesture } from './runtime-bridge'
import { readFixtureFields } from './journey'

const selector = 'button, a, input, select, textarea, summary, [role="button"], [role="link"], [role="radio"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="switch"]'
const secret = /password|secret|token|credential|one.time.code|credit.card/i
const label = (element: HTMLElement) => element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')?.split(' ').map((id) => element.ownerDocument.getElementById(id)?.textContent).join(' ').trim() || element.getAttribute('title') || (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? element.labels?.[0]?.textContent?.trim() || element.getAttribute('placeholder') || element.name || element.id : element.textContent?.trim() || element.closest('label')?.textContent?.trim()) || ''
const safe = (element: HTMLElement) => !secret.test([label(element), element.getAttribute('name'), element.getAttribute('autocomplete')].join(' ')) && !(element instanceof HTMLInputElement && ['password', 'file', 'hidden'].includes(element.type))
const visible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height || element.closest('[inert], [hidden], [aria-hidden="true"]') || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
  const modal = [...element.ownerDocument.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]')].filter(dialog => dialog.getClientRects().length && !dialog.closest('[hidden], [aria-hidden="true"]')).at(-1)
  if (modal && !modal.contains(element)) return false
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    // Portaled fixed dialogs can leave the body at zero height; root overflow clips to the viewport.
    const style = getComputedStyle(parent), box = parent === element.ownerDocument.body || parent === element.ownerDocument.documentElement ? { top: 0, left: 0, bottom: innerHeight, right: innerWidth } : parent.getBoundingClientRect()
    if (/hidden|clip/.test(style.overflowY) && (rect.bottom <= box.top || rect.top >= box.bottom) || /hidden|clip/.test(style.overflowX) && (rect.right <= box.left || rect.left >= box.right)) return false
  }
  return true
}
export type InteractionControl = { tag: string; role: string; name: string; index: number; count: number; disabled: boolean; destination?: string; link?: 'internal' | 'external' | 'unmapped'; expanded?: string; pressed?: string; selected?: string; checked?: string }
export type InteractionState = { scenario: string; persona: string; role: string; condition: string; viewport: { width: number; height: number }; controls: InteractionControl[]; landmarks: string[]; truncated: boolean }

/** Describes visible controls, including same-screen actions, without reading input values. */
export function interactionState(root: HTMLElement, context: Omit<InteractionState, 'controls' | 'landmarks' | 'truncated'>, scenarios: { id: string; route?: string }[]): InteractionState {
  const elements = [...root.querySelectorAll<HTMLElement>(selector)].filter(element => visible(element) && safe(element) && getComputedStyle(element).visibility !== 'hidden')
  const controls = elements.slice(0, 300).map(element => {
    const name = label(element).replace(/\s+/g, ' ').trim().slice(0, 200), tag = element.tagName.toLowerCase()
    const peers = elements.filter(peer => peer.tagName === element.tagName && label(peer).replace(/\s+/g, ' ').trim().slice(0, 200) === name)
    const role = element.getAttribute('role') || ({ a: 'link', button: 'button', summary: 'button', select: 'combobox', textarea: 'textbox' }[tag] ?? (element instanceof HTMLInputElement ? ['checkbox', 'radio', 'range'].includes(element.type) ? element.type === 'range' ? 'slider' : element.type : ['submit', 'button', 'reset'].includes(element.type) ? 'button' : 'textbox' : 'button'))
    const control: InteractionControl = { tag, role, name, index: peers.indexOf(element), count: peers.length, disabled: element.matches(':disabled, [aria-disabled="true"]') }
    for (const field of ['expanded', 'pressed', 'selected', 'checked'] as const) {
      const value = element.getAttribute(`aria-${field}`)
      if (value && ['true', 'false', 'mixed'].includes(value)) control[field] = value
    }
    if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) control.checked = String(element.checked)
    if (element instanceof HTMLDetailsElement || tag === 'summary') control.expanded = String(element.closest('details')?.open ?? false)
    if (element instanceof HTMLAnchorElement) {
      const href = new URL(element.href, location.href)
      const destination = href.origin === location.origin && scenarios.find(row => row.route && new RegExp('^' + row.route.split('/').map(part => part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '/?$').test(href.pathname))
      control.link = href.origin !== location.origin ? 'external' : destination ? 'internal' : 'unmapped'
      if (destination) control.destination = destination.id
    }
    return control
  })
  const landmarks = [...root.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open], [role="tab"][aria-selected="true"]')].filter(visible).map(element => (element.getAttribute('aria-label') || element.querySelector('h1,h2,h3')?.textContent || label(element)).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(name => name && !secret.test(name)).slice(0, 40)
  return { ...context, controls, landmarks, truncated: elements.length > 300 }
}

export function observeInteractions(root: HTMLElement, read: () => InteractionState, send: (state: InteractionState) => Promise<void>, failed: (error: Error) => void) {
  let previous = '', queue = Promise.resolve(), timer: ReturnType<typeof setTimeout> | undefined, stopped = false
  const capture = () => {
    const state = read(), signature = JSON.stringify(state)
    if (!root.closest('[inert]') && signature !== previous) {
      previous = signature
      queue = queue.then(() => send(state)).catch(error => { previous = ''; failed(error) })
    }
    return state
  }
  const schedule = () => { timer ??= setTimeout(() => { timer = undefined; if (!stopped) capture() }, 250) }
  const observer = new MutationObserver(schedule)
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert', 'open', 'hidden', 'disabled', 'class', 'style', 'aria-expanded', 'aria-pressed', 'aria-selected', 'aria-checked', 'aria-disabled', 'aria-hidden'] })
  window.addEventListener('resize', schedule)
  capture()
  return { capture, flush: async () => { capture(); await queue }, stop: () => { stopped = true; clearTimeout(timer); observer.disconnect(); window.removeEventListener('resize', schedule) } }
}
type CloseWatcher = EventTarget & { requestClose(): void; destroy(): void }
const closeWatchers = new WeakMap<Document, Set<CloseWatcher>>()

/** Synthetic Escape cannot trigger Chromium's native close-watchers. Reuse their requestClose API. */
export function trackCloseWatchers(document: Document) {
  const scope = document.defaultView as (Window & { CloseWatcher?: new () => CloseWatcher }) | null
  const Original = scope?.CloseWatcher
  if (!scope || !Original) return () => {}
  const watchers = new Set<CloseWatcher>(); closeWatchers.set(document, watchers)
  scope.CloseWatcher = new Proxy(Original, { construct(target, args) {
    const watcher = Reflect.construct(target, args) as CloseWatcher, destroy = watcher.destroy.bind(watcher)
    watchers.add(watcher)
    watcher.addEventListener('close', () => watchers.delete(watcher), { once: true })
    watcher.destroy = () => { watchers.delete(watcher); destroy() }
    return watcher
  } })
  return () => { scope.CloseWatcher = Original; closeWatchers.delete(document) }
}

export function runtimeFields(root: HTMLElement) {
  const quantities = [...root.querySelectorAll<HTMLElement>('[role="group"][aria-label]')].flatMap((group) => {
    const value = group.querySelector('[aria-live]')?.textContent?.trim()
    return visible(group) && safe(group) && value && /^\d+$/.test(value) && group.querySelectorAll('button').length >= 2 ? [{ label: label(group), value }] : []
  })
  return [...readFixtureFields(root.ownerDocument, root, (element) => safe(element) && visible(element)), ...quantities].filter((field) => !secret.test(field.label))
}
/**
 * The components a screen shows, as the app marks them in code (D31): `data-civic-component`
 * names the platform component, `data-civic-variant` and `data-civic-state` the contract's
 * variant and state, and each `data-civic-prop-<name>` a prop. Visible ones only, in page order.
 */
export function runtimeComponents(root: HTMLElement): RuntimeComponent[] {
  return [...root.querySelectorAll<HTMLElement>('[data-civic-component]')].filter(visible).map((element) => {
    const props = Object.fromEntries([...element.attributes].filter((attribute) => attribute.name.startsWith('data-civic-prop-')).map((attribute) => [attribute.name.slice('data-civic-prop-'.length), attribute.value]).sort(([a], [b]) => a.localeCompare(b)))
    const variant = element.dataset.civicVariant, state = element.dataset.civicState
    return { component: element.dataset.civicComponent!, ...(variant ? { variant } : {}), ...(state ? { state } : {}), ...(Object.keys(props).length ? { props } : {}) }
  })
}

export function runtimeView(root: HTMLElement) {
  return JSON.stringify([...root.querySelectorAll('h1, [role="dialog"] h2, [role="tab"][aria-selected="true"], button[aria-pressed="true"]')].filter((element) => visible(element as HTMLElement)).map((element) => element.textContent?.trim()))
}
function matching(root: HTMLElement, target: NonNullable<RuntimeGesture['target']>) {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter((element) => element.tagName.toLowerCase() === target.tag && label(element) === target.name && safe(element) && visible(element))
}
function targetOf(root: HTMLElement, element: HTMLElement) {
  const target = { tag: element.tagName.toLowerCase(), name: label(element), index: 0, count: 0 }
  const matches = matching(root, target); target.index = matches.indexOf(element); target.count = matches.length
  return target
}
/** Only open UI surfaces; submits and destructive actions need an authored isolated test. */
export function explorationTargets(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(element => {
    if (!visible(element) || !safe(element) || element.matches(':disabled, [aria-disabled="true"], a, input, textarea, select')) return false
    if (element instanceof HTMLButtonElement && element.form && element.type === 'submit') return false
    const name = label(element)
    if (/delete|remove|archive|send|save|submit|confirm|approve|accept|start|run|pause|stop|sign out|log out|purchase/i.test(name)) return false
    return element.tagName === 'SUMMARY' && !element.closest('details')?.open || element.getAttribute('aria-expanded') === 'false' || ['menu', 'dialog', 'listbox', 'true'].includes(element.getAttribute('aria-haspopup') ?? '') || element.getAttribute('role') === 'tab' && element.getAttribute('aria-selected') === 'false' || /^(?:open|show|edit|add|new|manage|invite|rename)\b|^(?:menu|more|options|command palette|keyboard shortcuts|shortcuts|help)$/i.test(name)
  }).map(element => targetOf(root, element)).filter(target => target.name && target.index >= 0)
}
export async function explorationPoint(root: HTMLElement, target: NonNullable<RuntimeGesture['target']>) {
  if (!explorationTargets(root).some(candidate => JSON.stringify(candidate) === JSON.stringify(target))) throw Error('Control is outside automatic exploration policy')
  const element = matching(root, target)[target.index]
  element.scrollIntoView({ block: 'center', inline: 'center' })
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const box = element.getBoundingClientRect()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
export async function replayGesture(root: HTMLElement, gesture: RuntimeGesture) {
  if (gesture.kind === 'key' && gesture.value === 'Escape') {
    const watcher = [...(closeWatchers.get(root.ownerDocument) ?? [])].at(-1)
    if (watcher) watcher.requestClose()
    else (root.ownerDocument.activeElement ?? root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    return
  }
  if (!gesture.target || !['input', 'click'].includes(gesture.kind)) throw Error('Unknown recorded interaction')
  const matches = matching(root, gesture.target)
  // Repeated labels need a stable ordinal; a changed number of controls must stop before a write.
  const element = matches[gesture.target.index]
  if (!element || matches.length !== gesture.target.count || ('disabled' in element && element.disabled)) throw Error(`Recorded control is missing, disabled or ambiguous: ${gesture.target.name}`)
  if (gesture.kind === 'click') { element.click(); return }
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) || typeof gesture.value !== 'string') throw Error('Recorded input no longer exists')
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, gesture.value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
export function observeRuntime(root: HTMLElement, bridge: RuntimeBridge, changed: () => void, failed: (error: Error) => void, inputAllowed: (name: string) => boolean) {
  const record = (event: Event) => {
    if (!event.isTrusted) return
    // A replay drives the app itself; a person's input must not interleave with it.
    if (bridge.isReplaying() || root.ownerDocument.getElementById('review-root')?.dataset.rehearsalReplaying === 'true') { event.preventDefault(); event.stopImmediatePropagation(); return }
    if (event.type === 'pointerdown') { bridge.prepare(); return }
    if (event.type === 'beforeinput') { const element = (event.target as Element).closest<HTMLElement>(selector); if (element) bridge.prepare(targetOf(root, element)); return }
    if (event instanceof KeyboardEvent) {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement && ['checkbox', 'radio'].includes(event.target.type)) bridge.prepare()
      if (event.key !== 'Escape') return
      bridge.record({ kind: 'key', value: 'Escape', target: { tag: 'document', name: 'Escape', index: 0, count: 1 } })
      setTimeout(() => { void bridge.flush().then(changed).catch(failed) }, 0); return
    }
    let element = (event.target as Element).closest<HTMLElement>(selector)
    if (!element && event.target instanceof HTMLLabelElement) element = event.target.control
    if (!element || !root.contains(element) || !safe(element) || !visible(element)) return
    const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
    if (event.type === 'click' && input && !(element instanceof HTMLInputElement && ['radio', 'checkbox', 'button', 'submit'].includes(element.type))) return
    if (event.type !== 'click' && (!input || element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type))) return
    const target = targetOf(root, element)
    if (!target.name || target.index < 0) return
    if (event.type !== 'click' && !inputAllowed(target.name)) { failed(Error(`Input is outside the recording policy: ${target.name}`)); return }
    bridge.record({ kind: event.type === 'click' ? 'click' : 'input', target, ...(event.type === 'click' ? {} : { value: (element as HTMLInputElement).value }) })
    // Capture listeners run before the app handler. Settle on the next task, after that handler.
    setTimeout(() => { void bridge.flush().then(changed).catch(failed) }, 0)
  }
  root.addEventListener('click', record, true); root.addEventListener('input', record, true); root.addEventListener('change', record, true); root.addEventListener('pointerdown', record, true); root.addEventListener('beforeinput', record, true); root.ownerDocument.addEventListener('keydown', record, true)
  return () => { root.removeEventListener('click', record, true); root.removeEventListener('input', record, true); root.removeEventListener('change', record, true); root.removeEventListener('pointerdown', record, true); root.removeEventListener('beforeinput', record, true); root.ownerDocument.removeEventListener('keydown', record, true) }
}
