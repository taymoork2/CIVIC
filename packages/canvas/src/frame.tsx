import project from 'virtual:civic-project'
import { bindProjectRequests, projectFetch } from './project-request'
import type { AdapterContext, AdapterState, AdapterScenario, ReviewConfig, ReviewSnapshot, ProjectChoice } from './adapter'
import { readFixtureFields } from './journey'
import { createRuntimeBridge } from './runtime-bridge'
import { fillCredentials, openRuntimeSession, routeFetch } from './runtime-session'
import { routeServerFunctions } from './server-functions'
import { observeRuntime, replayGesture, runtimeFields, runtimeView, trackCloseWatchers } from './runtime-dom'
import type { RuntimeBridge, RuntimeGesture, RuntimeRecording } from './runtime-bridge'
import { defaultViewportHeight, validViewport, type PreviewViewport } from './viewport-presets'

bindProjectRequests(project.key)

const root = document.getElementById('review-root')!
// A screen may appear before its run and recorder are ready; no input counts until then.
document.body.inert = true
const stopCloseWatchers = trackCloseWatchers(document)
window.addEventListener('pagehide', stopCloseWatchers, { once: true })
try {
  const response = await projectFetch('/api/review/index')
  if (!response.ok) throw Error('Project inventory unavailable. Repair the connection and reload.')
  const index = await response.json() as ReviewSnapshot & { scenarios: AdapterScenario[] }
  const params = new URLSearchParams(location.search)
  let recording: RuntimeRecording | undefined
  if (params.has('recording')) {
    const result = await projectFetch(`/api/review/runs/${encodeURIComponent(params.get('recording')!)}`)
    if (!result.ok) throw Error('Saved recording unavailable for this project.')
    recording = await result.json()
    if (recording!.project !== project.key || recording!.source !== index.revision.source) throw Error('Recording belongs to another project or source revision. Inspect its evidence before starting a new run.')
  }
  const savedConfig = (recording?.seed as { context?: ReviewConfig } | undefined)?.context
  let restoring = Boolean(recording)
  const scenario = index.scenarios.find((s) => s.id === (savedConfig?.scenario ?? params.get('scenario') ?? index.scenarios[0]?.id))
  if (!scenario) throw Error('This scenario is not registered. Add a starting state to the project registry.')
  const pick = (key: string, rows: ProjectChoice[]) => {
    const row = rows.find((row) => row.id === (savedConfig?.[key as 'persona' | 'role' | 'condition'] ?? params.get(key) ?? rows[0]!.id))
    if (!row) throw Error(`Unknown project ${key}; choose a declared preset.`)
    return row
  }
  const persona = pick('persona', project.personas), role = pick('role', project.roles), condition = pick('condition', project.conditions)
  const preset = params.get('preset') ?? undefined
  const config: ReviewConfig = savedConfig ? structuredClone(savedConfig) : { scenario: scenario.id, persona: persona.id, role: role.id, condition: condition.id, theme: params.get('theme') === 'dark' ? 'dark' : 'light', textScale: params.get('scale') === '2' ? 2 : 1, width: Number(params.get('width')) || 393, height: Number(params.get('height')) || defaultViewportHeight, ...(preset ? { preset } : {}) }
  const snapshot = { revision: index.revision, design: index.design }
  // Recordings made before viewports had a height keep none in their seed, so they still replay; they show at the default height.
  const initialViewport: PreviewViewport = { width: config.width, height: config.height ?? defaultViewportHeight, theme: config.theme, textScale: config.textScale, ...(config.preset ? { preset: config.preset } : {}) }
  if (!validViewport(initialViewport)) throw Error('Invalid preview viewport')
  /** Resizes the live frame in place: the app, its run and its inputs stay; only the viewport, appearance and text size change. */
  const resize = async (value: unknown) => {
    if (!validViewport(value)) throw Error('Invalid preview viewport')
    const iframe = window.frameElement as HTMLIFrameElement | null
    if (!iframe) throw Error('Viewport changes need an embedded live preview.')
    const scroll = { left: scrollX, top: scrollY }
    iframe.style.width = `${value.width}px`; iframe.style.height = `${value.height}px`
    const box = iframe.closest<HTMLElement>('.app-live-screen')
    if (box) { const scale = box.clientWidth / value.width; iframe.style.transform = `scale(${scale})`; iframe.style.transformOrigin = '0 0'; box.style.height = `${value.height * scale}px` }
    document.documentElement.dataset.theme = value.theme
    document.documentElement.style.fontSize = value.textScale === 2 ? '200%' : '100%'
    config.width = value.width; config.height = value.height; config.theme = value.theme; config.textScale = value.textScale
    if (value.preset) config.preset = value.preset; else delete config.preset
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    window.scrollTo(scroll)
  }
  const { mount } = await import('virtual:civic-preview')
  if (typeof mount !== 'function') throw Error('The project preview entry must export mount(container, context).')
  let state: AdapterState | null = null
  // The screen the app is on as far as it has told the frame: each publish, and each transition the moment it is reported.
  // A transition is checked from here, not from the last published state, which follows only after the app settles.
  let at: string | null = null
  let runtimeBridge: RuntimeBridge | undefined
  let mounted = false
  let stopRuntime: (() => void) | undefined
  const fields = (screen: string) => {
    const allowed = index.scenarios.find((s) => s.id === screen)?.captureFields ?? []
    return readFixtureFields(document).filter((field) => allowed.includes(field.label) && !/password|secret|token|credential/i.test(field.label))
  }
  document.documentElement.dataset.theme = config.theme
  document.documentElement.dataset.reviewCondition = config.condition
  document.documentElement.style.fontSize = config.textScale === 2 ? '200%' : '100%'
  window.reviewPreview = { config, snapshot, state: () => state ? { ...state, fields: fields(state.screen) } : null, data: () => ({ screen: state?.screen }), restart: () => location.reload(), retryWrites: () => { throw Error('Restart with a declared condition to change this adapter run.') } }
  const context: AdapterContext = {
    config, scenario, persona: structuredClone(persona), role, condition, snapshot, recording,
    publish(next) {
      if (!index.scenarios.some((s) => s.id === next.screen)) throw Error(`Unmapped adapter screen: ${next.screen}`)
      state = { screen: next.screen, dirty: Boolean(next.dirty), pending: Boolean(next.pending), title: index.scenarios.find((s) => s.id === next.screen)!.label, fields: fields(next.screen) }
      at = state.screen
      if (mounted && !restoring) root.dataset.rehearsalReady = 'true'
      window.dispatchEvent(new CustomEvent('rehearsal-state', { detail: state }))
    },
    transition(destination, action, origin = 'app') {
      if (runtimeBridge?.isReplaying()) return
      if (!state || !at) throw Error('Publish the current state before reporting a transition.')
      const from = index.scenarios.find((s) => s.id === at)
      if (!from?.edges?.some((edge) => edge.destination === destination && edge.action === action) || !index.scenarios.some((s) => s.id === destination)) throw Error('Transition is not a registered project edge.')
      const current = from.id === state.screen ? { ...state, fields: fields(state.screen) } : { screen: from.id, dirty: false, pending: false, title: from.label, fields: fields(from.id) }
      at = destination
      window.dispatchEvent(new CustomEvent('rehearsal-transition', { detail: { from: from.id, to: destination, action, origin, state: current } }))
    },
    connectRuntime(ports) {
      if (stopRuntime) throw Error('This frame already has an application runtime.')
      // App dialogs can portal beside the React root; the isolated frame is the recording boundary.
      const scope = root.ownerDocument.body
      const captured = () => runtimeFields(scope).filter((field) => ports.captureInputs === 'synthetic' || ports.captureInputs.includes(field.label))
      const settle = async () => {
        await ports.settle()
        const animations = document.getAnimations().filter((animation) => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime) && Number(animation.effect?.getComputedTiming().endTime) <= 5000)
        await Promise.allSettled(animations.map((animation) => animation.finished))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        await ports.settle()
      }
      const run = ports.run
      /** The run's own steps: switching account, the connection, the clock and saved steps. Each is recorded and replayed. */
      const control = async (gesture: RuntimeGesture) => {
        const name = gesture.target?.name, value = JSON.parse(gesture.value ?? 'null')
        if (name === 'viewport') return resize(value)
        if (!run) throw Error('This preview has no isolated run to control.')
        if (name === 'identity' && typeof value === 'string') await run.identity(value)
        else if (name === 'connection' && typeof value === 'boolean') run.connection(value)
        else if (name === 'time' && Number.isInteger(value) && value > 0 && value <= 1440) await run.advance(value)
        else if (name === 'applyPending' && typeof value === 'string') await run.transport.apply(value)
        else if (name === 'discardPending' && typeof value === 'string') run.transport.discard(value)
        else throw Error('Unsupported run step')
        await ports.changed?.(name)
      }
      const commands = ['viewport', 'identity', 'connection', 'time', 'applyPending', 'discardPending']
      const interact = (gesture: RuntimeGesture) => gesture.kind === 'command' && gesture.target?.tag === 'adapter' && commands.includes(gesture.target.name) ? control(gesture) : ports.interact ? ports.interact(gesture) : replayGesture(scope, gesture)
      // A replay starts from the viewport the recording started in.
      const reset = async (tape: RuntimeRecording) => { if (window.frameElement) await resize(initialViewport); await ports.reset(tape) }
      const bridge = createRuntimeBridge({ ...ports, reset, settle, seed: { context: structuredClone(config), application: ports.seed }, project: project.key, source: snapshot.revision.source, fields: captured, view: () => runtimeView(scope), interact })
      runtimeBridge = bridge
      const publish = () => {
        const screen = ports.screen(), entry = index.scenarios.find((scenario) => scenario.id === screen)
        if (!entry) { state = { screen, dirty: false, pending: false, title: `Unmapped route: ${screen}`, fields: captured() }; at = screen; delete root.dataset.rehearsalReady; window.dispatchEvent(new CustomEvent('rehearsal-state', { detail: state })); throw Error(`Unmapped application route: ${screen}`) }
        state = { screen, dirty: false, pending: false, ...ports.status?.(), title: entry.label, fields: captured() }
        at = screen
        if (window.reviewPreview) window.reviewPreview.config = { ...config, scenario: screen }
        if (mounted && !restoring && !bridge.isReplaying()) root.dataset.rehearsalReady = 'true'
        window.dispatchEvent(new CustomEvent('rehearsal-state', { detail: state }))
        window.dispatchEvent(new Event('rehearsal-run'))
      }
      const failed = (error: Error) => { root.dataset.rehearsalRunError = error.message; window.dispatchEvent(new Event('rehearsal-run')) }
      const stopObserving = observeRuntime(scope, bridge, publish, failed, (name) => ports.captureInputs === 'synthetic' || ports.captureInputs.includes(name))
      const stopRoutes = ports.subscribe?.(() => { void settle().then(publish).catch(failed) })
      stopRuntime = () => { stopObserving(); stopRoutes?.() }
      window.reviewPreview = { config, snapshot, state: () => state, data: ports.data, restart: () => location.reload(), retryWrites: () => { throw Error('Start a normal run to change a declared failure condition.') }, recording: bridge.recording, replayMismatch: bridge.mismatch, replay: async (tape) => {
        root.dataset.rehearsalReplaying = 'true'
        const guarded = document.body.inert
        document.body.inert = false
        try { const result = await bridge.replay(tape); publish(); return result }
        finally { document.body.inert = guarded; delete root.dataset.rehearsalReplaying }
      } }
      /** Records a step, performs it and waits for the app to settle. A replay can't be interrupted by one. */
      const step = async (name: string, value: unknown) => {
        if (bridge.isReplaying()) throw Error('Wait for the replay to finish.')
        const gesture = { kind: 'command', target: { tag: 'adapter', name, index: 0, count: 1 }, value: JSON.stringify(value) }
        const blocking = name === 'identity'
        // Recording seals the previous step from the screen as it was, so input is held only after it.
        bridge.record(gesture)
        if (blocking) { document.body.inert = true; delete root.dataset.rehearsalReady }
        try { await control(gesture); await bridge.flush(); publish() }
        finally { if (blocking) { document.body.inert = false; root.dataset.rehearsalReady = 'true' } }
      }
      window.reviewPreview.setViewport = (value) => { if (!validViewport(value)) throw Error('Invalid preview viewport'); return step('viewport', value) }
      if (run) {
        window.reviewRuntime = { status: () => ({ ...run.status(), path: ports.route() }), command: step, reopen: () => { const next = new URL(location.href); next.searchParams.set('runtimeRun', run.session.id); for (const [key, value] of Object.entries({ width: config.width, height: config.height ?? defaultViewportHeight, theme: config.theme, scale: config.textScale })) next.searchParams.set(key, String(value)); if (config.preset) next.searchParams.set('preset', config.preset); next.searchParams.set('disconnected', run.status().connected ? '0' : '1'); next.searchParams.delete('recording'); return next.pathname + next.search } }
        const stopStatus = run.subscribe(() => window.dispatchEvent(new Event('rehearsal-run')))
        const stopObserver = stopRuntime
        stopRuntime = () => { stopStatus(); stopObserver?.(); delete window.reviewRuntime }
      }
      publish()
      return bridge
    },
    async startRuntime(options) {
      if (!project.runtime) throw Error('This project declares no runtime entry. Add adapter.runtime to its civic.project.json.')
      const run = await openRuntimeSession(context)
      const identity = run.session.identity
      const restoreFetch = routeFetch(run.transport, options.routes ?? ['/api/'], identity?.credential)
      const restoreServerFunctions = routeServerFunctions(run.transport)
      const stopFilling = identity ? fillCredentials(root, identity.credential) : () => {}
      const stop = () => { stopFilling(); restoreServerFunctions(); restoreFetch(); run.close() }
      try {
        await options.load?.()
        const bridge = context.connectRuntime({
          seed: run.seed, now: run.session.now, captureInputs: options.captureInputs ?? 'synthetic',
          screen: options.screen, route: options.route ?? options.screen, subscribe: options.subscribe, status: options.status,
          data: run.data, assertSource: run.assertSource, settle: run.settle, run, changed: options.changed,
          reset: async () => { await run.reset(); await options.reset() },
        })
        run.transport.bind(bridge)
        window.addEventListener('pagehide', stop, { once: true })
        return { bridge, close: stop, identity: identity && { id: identity.id, name: identity.name, email: identity.email, signedIn: identity.signedIn }, query: (name, args = {}) => run.transport.request('query', name, args), mutation: (name, args = {}) => run.transport.request('mutation', name, args) }
      } catch (error) { stop(); throw error }
    },
  }
  const dispose = await mount(root, context)
  if (window.frameElement) await resize(initialViewport)
  // Ready is only announced once input is allowed, so nothing typed before then is lost to the inert page.
  mounted = true
  if (window.reviewPreview && !window.reviewPreview.setViewport) window.reviewPreview.setViewport = resize
  if (!restoring) document.body.inert = false
  if (!restoring && state) root.dataset.rehearsalReady = 'true'
  if (!state && project.adapter === 'module') throw Error('The preview adapter did not publish a ready screen.')
  if (recording) {
    if (!window.reviewPreview?.replay) throw Error('This adapter does not support replay.')
    try { await window.reviewPreview.replay(recording) }
    catch (error) { stopRuntime?.(); dispose?.(); delete window.reviewPreview; throw error }
    restoring = false; root.dataset.rehearsalReady = 'true'; window.dispatchEvent(new Event('rehearsal-run'))
  }
  document.body.inert = false
  window.addEventListener('pagehide', () => { stopRuntime?.(); dispose?.(); delete window.reviewPreview }, { once: true })
} catch (error) {
  document.body.inert = false
  stopCloseWatchers()
  delete root.dataset.rehearsalReady
  root.replaceChildren()
  const heading = document.createElement('h1'); heading.textContent = 'Preview unavailable'
  const detail = document.createElement('p'); detail.setAttribute('role', 'alert'); detail.textContent = (error as Error).message
  root.append(heading, detail)
  const retries = Number(new URLSearchParams(location.search).get('mountRetry') ?? 0)
  if (/Failed to fetch dynamically imported module|Importing a module script failed|Source changed during startup|Source changed while creating the run/.test(detail.textContent) && retries < 2 && !window.reviewPreview?.state?.()) {
    detail.textContent = 'The preview compiler is updating. Retrying automatically…'
    const retry = new URL(location.href); retry.searchParams.set('mountRetry', String(retries + 1))
    setTimeout(() => location.replace(retry.href), 1000)
  }
}
