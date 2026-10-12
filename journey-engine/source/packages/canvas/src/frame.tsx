import project from 'virtual:civic-project'
import { bindProjectRequests, projectFetch } from './project-request'
import type { AdapterContext, AdapterState, AdapterScenario, ReviewConfig, ReviewSnapshot, ProjectChoice } from './adapter'
import { readFixtureFields } from './journey'
import { createRuntimeBridge } from './runtime-bridge'
import { fillCredentials, openRuntimeSession, routeFetch } from './runtime-session'
import { routeServerFunctions } from './server-functions'
import { observeRuntime, replayGesture, runtimeFields, runtimeView, trackCloseWatchers } from './runtime-dom'
import type { RuntimeBridge, RuntimeRecording } from './runtime-bridge'

bindProjectRequests(project.key)

const root = document.getElementById('review-root')!
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
  const config: ReviewConfig = savedConfig ?? { scenario: scenario.id, persona: persona.id, role: role.id, condition: condition.id, theme: params.get('theme') === 'dark' ? 'dark' : 'light', textScale: params.get('scale') === '2' ? 2 : 1, width: Number(params.get('width')) || 393 }
  const snapshot = { revision: index.revision, design: index.design }
  const { mount } = await import('virtual:civic-preview')
  if (typeof mount !== 'function') throw Error('The project preview entry must export mount(container, context).')
  let state: AdapterState | null = null
  let runtimeBridge: RuntimeBridge | undefined
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
      if (!restoring) root.dataset.rehearsalReady = 'true'
      window.dispatchEvent(new CustomEvent('rehearsal-state', { detail: state }))
    },
    transition(destination, action, origin = 'app') {
      if (runtimeBridge?.isReplaying()) return
      if (!state) throw Error('Publish the current state before reporting a transition.')
      const from = index.scenarios.find((s) => s.id === state!.screen)
      if (!from?.edges?.some((edge) => edge.destination === destination && edge.action === action) || !index.scenarios.some((s) => s.id === destination)) throw Error('Transition is not a registered project edge.')
      const current = { ...state, fields: fields(state.screen) }
      window.dispatchEvent(new CustomEvent('rehearsal-transition', { detail: { from: state.screen, to: destination, action, origin, state: current } }))
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
      const bridge = createRuntimeBridge({ ...ports, settle, seed: { context: structuredClone(config), application: ports.seed }, project: project.key, source: snapshot.revision.source, fields: captured, view: () => runtimeView(scope), interact: ports.interact ?? ((gesture) => replayGesture(scope, gesture)) })
      runtimeBridge = bridge
      const publish = () => {
        const screen = ports.screen(), entry = index.scenarios.find((scenario) => scenario.id === screen)
        if (!entry) { state = { screen, dirty: false, pending: false, title: `Unmapped route: ${screen}`, fields: captured() }; delete root.dataset.rehearsalReady; window.dispatchEvent(new CustomEvent('rehearsal-state', { detail: state })); throw Error(`Unmapped application route: ${screen}`) }
        state = { screen, dirty: false, pending: false, ...ports.status?.(), title: entry.label, fields: captured() }
        if (window.reviewPreview) window.reviewPreview.config = { ...config, scenario: screen }
        if (!restoring && !bridge.isReplaying()) root.dataset.rehearsalReady = 'true'
        window.dispatchEvent(new CustomEvent('rehearsal-state', { detail: state }))
        window.dispatchEvent(new Event('rehearsal-run'))
      }
      const failed = (error: Error) => { root.dataset.rehearsalRunError = error.message; window.dispatchEvent(new Event('rehearsal-run')) }
      const stopObserving = observeRuntime(scope, bridge, publish, failed, (name) => ports.captureInputs === 'synthetic' || ports.captureInputs.includes(name))
      const stopRoutes = ports.subscribe?.(() => { void settle().then(publish).catch(failed) })
      stopRuntime = () => { stopObserving(); stopRoutes?.() }
      window.reviewPreview = { config, snapshot, state: () => state, data: ports.data, restart: () => location.reload(), retryWrites: () => { throw Error('Start a normal run to change a declared failure condition.') }, recording: bridge.recording, replayMismatch: bridge.mismatch, replay: async (tape) => { root.dataset.rehearsalReplaying = 'true'; try { const result = await bridge.replay(tape); publish(); return result } finally { delete root.dataset.rehearsalReplaying } } }
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
          data: run.data, assertSource: run.assertSource, settle: run.settle,
          reset: async () => { await run.reset(); await options.reset() },
        })
        run.transport.bind(bridge)
        window.addEventListener('pagehide', stop, { once: true })
        return { bridge, close: stop, identity: identity && { id: identity.id, name: identity.name, email: identity.email, signedIn: identity.signedIn } }
      } catch (error) { stop(); throw error }
    },
  }
  const dispose = await mount(root, context)
  if (!state && project.adapter === 'module') throw Error('The preview adapter did not publish a ready screen.')
  if (recording) {
    if (!window.reviewPreview?.replay) throw Error('This adapter does not support replay.')
    try { await window.reviewPreview.replay(recording) }
    catch (error) { stopRuntime?.(); dispose?.(); delete window.reviewPreview; throw error }
    restoring = false; root.dataset.rehearsalReady = 'true'; window.dispatchEvent(new Event('rehearsal-run'))
  }
  window.addEventListener('pagehide', () => { stopRuntime?.(); dispose?.(); delete window.reviewPreview }, { once: true })
} catch (error) {
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
