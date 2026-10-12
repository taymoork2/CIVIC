import { Component, createElement, useLayoutEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AdapterContext, AdapterScenario } from './adapter'

type Screen = AdapterScenario & { source: string; assetRoot: string; kind: 'html' | 'react'; export: string; route: string; fixture?: { props?: Record<string, unknown> } }
class PreviewBoundary extends Component<{ children: ReactNode; failed: (error: Error) => void }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  componentDidCatch(error: Error) { this.props.failed(error) }
  render() { return this.state.error ? <p role="alert">This screen needs app context: {this.state.error}</p> : this.props.children }
}
function Ready({ children, ready }: { children: ReactNode; ready: () => void }) {
  useLayoutEffect(ready, [])
  return children
}

export async function mountDiscovered(container: HTMLElement, context: AdapterContext, screens: Screen[]) {
  const mounted = new Map<string, { element: HTMLElement; root?: Root }>()
  let current = screens.find((row) => row.id === context.scenario.id)!, dirty = false, moving = false, disposed = false
  let navigation = Promise.resolve()
  if (!current) throw Error('Generated adapter has no matching screen')
  const status = document.createElement('p'); status.setAttribute('role', 'status')
  const stage = document.createElement('div'); container.append(stage, status)
  const publish = () => context.publish({ screen: current.id, dirty, pending: moving })
  const report = (message: string) => { status.textContent = message }
  const localAsset = (value: string, screen: Screen) => {
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value.startsWith('data:image/') ? value : ''
    const url = new URL(value.startsWith('/') ? screen.assetRoot + value.slice(1) : value, location.origin + screen.source)
    return url.origin === location.origin && url.pathname.startsWith('/@fs/') ? url.pathname + url.search : ''
  }
  const show = async (screen: Screen) => {
    let entry = mounted.get(screen.id)
    if (!entry) {
      const element = document.createElement('section'); element.setAttribute('aria-label', screen.label)
      stage.append(element); entry = { element }; mounted.set(screen.id, entry)
      if (screen.kind === 'html') {
        const source = await import(/* @vite-ignore */ screen.source + '?raw')
        if (disposed) return
        const doc = new DOMParser().parseFromString(source.default, 'text/html')
        for (const node of doc.querySelectorAll('script,iframe,object,embed,base,meta,link[rel="preload"],link[rel="modulepreload"]')) node.remove()
        for (const node of doc.querySelectorAll('*')) for (const attribute of [...node.attributes]) {
          if (/^on/i.test(attribute.name) || ['srcdoc', 'formaction', 'target'].includes(attribute.name)) node.removeAttribute(attribute.name)
          else if (['src', 'poster'].includes(attribute.name) || node.tagName === 'LINK' && attribute.name === 'href') node.setAttribute(attribute.name, localAsset(attribute.value, screen))
          else if (attribute.name === 'srcset') node.removeAttribute(attribute.name)
        }
        for (const field of doc.querySelectorAll<HTMLInputElement>('input[type=password],input[type=hidden]')) field.value = ''
        element.append(...doc.head.querySelectorAll('style,link[rel=stylesheet]'), ...doc.body.childNodes)
      } else {
        const module = await import(/* @vite-ignore */ screen.source)
        if (disposed) return
        const Presenter = module[screen.export]
        if (typeof Presenter !== 'function') throw Error(`No callable ${screen.export} export. Choose another isolated component.`)
        const root = createRoot(element); entry.root = root
        await new Promise<void>((resolve, reject) => root.render(<PreviewBoundary failed={(error) => { report(`Screen needs app context: ${error.message}`); reject(error) }}><Ready ready={resolve}>{createElement(Presenter, screen.fixture?.props ?? {})}</Ready></PreviewBoundary>))
      }
    }
    if (disposed) return
    for (const [id, mountedScreen] of mounted) { mountedScreen.element.hidden = id !== screen.id; mountedScreen.element.style.display = id === screen.id ? '' : 'none' }
    current = screen; publish()
  }
  const go = (edge: NonNullable<AdapterScenario['edges']>[number]) => {
    if (moving || disposed) return
    moving = true
    // Capture the departing real DOM before hiding it. Return visits retain mounted component state.
    navigation = (async () => {
      try { context.transition(edge.destination, edge.action, 'synthetic'); await show(screens.find((screen) => screen.id === edge.destination)!); report('') }
      catch (error) { report(`Cannot open this screen: ${(error as Error).message}`); for (const [id, entry] of mounted) { entry.element.hidden = id !== current.id; entry.element.style.display = id === current.id ? '' : 'none' } }
      finally { moving = false; if (!disposed) publish() }
    })()
  }
  const findEdge = (action: string, href?: string) => current.edges?.find((edge) => edge.action === action) ?? current.edges?.find((edge) => {
    const destination = screens.find((screen) => screen.id === edge.destination)
    if (!href || !destination) return false
    const route = new URL(href, location.origin + current.source).pathname
    return href.split(/[?#]/)[0] === destination.route || route === destination.source
  })
  const click = (event: MouseEvent) => {
    const target = (event.target as Element).closest<HTMLAnchorElement | HTMLButtonElement>('a,button')
    if (!target || !stage.contains(target) || target.tagName === 'BUTTON' && (target as HTMLButtonElement).type === 'submit' && target.closest('form')) return
    const href = target.getAttribute('href') ?? undefined
    const edge = findEdge(target.textContent?.trim() ?? '', href)
    if (target.tagName === 'A' || edge) {
      event.preventDefault(); event.stopPropagation()
      if (edge) void go(edge); else report(`Unmapped link: ${href ?? target.textContent}. Add its path in onboarding.`)
    }
  }
  const submit = (event: SubmitEvent) => {
    event.preventDefault(); event.stopPropagation()
    const form = event.target as HTMLFormElement
    if (!form.reportValidity()) return
    const action = event.submitter?.textContent?.trim() || 'Submit form'
    const edge = findEdge(action, form.getAttribute('action') ?? undefined)
    if (edge) void go(edge); else report('This form needs a mapped destination. No app request was sent.')
  }
  const changed = () => { dirty = true; publish() }
  const dispose = () => { disposed = true; stage.removeEventListener('click', click, true); stage.removeEventListener('submit', submit, true); stage.removeEventListener('input', changed); stage.removeEventListener('change', changed); for (const entry of mounted.values()) entry.root?.unmount(); container.replaceChildren() }
  stage.addEventListener('click', click, true); stage.addEventListener('submit', submit, true); stage.addEventListener('input', changed); stage.addEventListener('change', changed)
  try { await show(current) } catch (error) { dispose(); throw error }
  context.connectRuntime({ seed: { scenario: context.scenario.id }, now: context.recording?.now ?? Date.now(), route: () => current.route, screen: () => current.id, captureInputs: [...new Set(screens.flatMap((screen) => screen.captureFields ?? []))], data: () => ({ screen: current.id, navigation: 'synthetic' }),
    settle: async () => { await navigation; await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) },
    reset: async () => { await navigation; for (const entry of mounted.values()) entry.root?.unmount(); mounted.clear(); stage.replaceChildren(); dirty = false; await show(screens.find((screen) => screen.id === context.scenario.id)!); report('') },
    assertSource: async () => { const response = await fetch('/api/review/index'); if (!response.ok || (await response.json()).revision.source !== context.snapshot.revision.source) throw Error('Source changed. Start a new run.') },
  })
  return dispose
}
