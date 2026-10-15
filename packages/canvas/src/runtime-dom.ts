import type { RuntimeBridge, RuntimeComponent, RuntimeGesture } from './runtime-bridge'
import { readFixtureFields } from './journey'

const selector = 'button, a, input, select, textarea, [role="radio"], [role="checkbox"], [role="tab"]'
const secret = /password|secret|token|credential|one.time.code|credit.card/i
const label = (element: HTMLElement) => element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')?.split(' ').map((id) => element.ownerDocument.getElementById(id)?.textContent).join(' ').trim() || (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? element.labels?.[0]?.textContent?.trim() || element.name || element.id : element.textContent?.trim() || element.closest('label')?.textContent?.trim()) || ''
const safe = (element: HTMLElement) => !secret.test([label(element), element.getAttribute('name'), element.getAttribute('autocomplete')].join(' ')) && !(element instanceof HTMLInputElement && ['password', 'file', 'hidden'].includes(element.type))
const visible = (element: HTMLElement) => element.getBoundingClientRect().width > 0 && !element.closest('[inert], [hidden], [aria-hidden="true"]')
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
