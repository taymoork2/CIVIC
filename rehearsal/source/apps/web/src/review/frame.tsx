import project from 'virtual:rehearsal-project'
import { bindProjectRequests, projectFetch } from './project-request'
import type { AdapterState, AdapterScenario, ReviewConfig, ReviewSnapshot, ProjectChoice } from './adapter'
import { readFixtureFields } from './journey'

bindProjectRequests(project.key)

const root = document.getElementById('review-root')!
try {
  const response = await projectFetch('/api/review/index')
  if (!response.ok) throw Error('Project inventory unavailable. Repair the connection and reload.')
  const index = await response.json() as ReviewSnapshot & { scenarios: AdapterScenario[] }
  const params = new URLSearchParams(location.search)
  const scenario = index.scenarios.find((s) => s.id === (params.get('scenario') ?? index.scenarios[0]?.id))
  if (!scenario) throw Error('This scenario is not registered. Add a starting state to the project registry.')
  const pick = (key: string, rows: ProjectChoice[]) => {
    const row = rows.find((row) => row.id === (params.get(key) ?? rows[0]!.id))
    if (!row) throw Error(`Unknown project ${key}; choose a declared preset.`)
    return row
  }
  const persona = pick('persona', project.personas), role = pick('role', project.roles), condition = pick('condition', project.conditions)
  const config: ReviewConfig = { scenario: scenario.id, persona: persona.id, role: role.id, condition: condition.id, theme: params.get('theme') === 'dark' ? 'dark' : 'light', textScale: params.get('scale') === '2' ? 2 : 1, width: Number(params.get('width')) || 393 }
  const snapshot = { revision: index.revision, design: index.design }
  const { mount } = await import('virtual:rehearsal-preview')
  if (typeof mount !== 'function') throw Error('The project preview entry must export mount(container, context).')
  let state: AdapterState | null = null
  const fields = (screen: string) => {
    const allowed = index.scenarios.find((s) => s.id === screen)?.captureFields ?? []
    return readFixtureFields(document).filter((field) => allowed.includes(field.label) && !/password|secret|token|credential/i.test(field.label))
  }
  document.documentElement.dataset.theme = config.theme
  document.documentElement.dataset.reviewCondition = config.condition
  document.documentElement.style.fontSize = config.textScale === 2 ? '200%' : '100%'
  window.reviewPreview = { config, snapshot, state: () => state ? { ...state, fields: fields(state.screen) } : null, data: () => ({ screen: state?.screen }), restart: () => location.reload(), retryWrites: () => { throw Error('Restart with a declared condition to change this adapter run.') } }
  const dispose = await mount(root, {
    config, scenario, persona: structuredClone(persona), role, condition, snapshot,
    publish(next) {
      if (!index.scenarios.some((s) => s.id === next.screen)) throw Error(`Unmapped adapter screen: ${next.screen}`)
      state = { screen: next.screen, dirty: Boolean(next.dirty), pending: Boolean(next.pending), title: index.scenarios.find((s) => s.id === next.screen)!.label, fields: fields(next.screen) }
      root.dataset.rehearsalReady = 'true'
      window.dispatchEvent(new CustomEvent('rehearsal-state', { detail: state }))
    },
    transition(destination, action, origin = 'app') {
      if (!state) throw Error('Publish the current state before reporting a transition.')
      const from = index.scenarios.find((s) => s.id === state!.screen)
      if (!from?.edges?.some((edge) => edge.destination === destination && edge.action === action) || !index.scenarios.some((s) => s.id === destination)) throw Error('Transition is not a registered project edge.')
      const current = { ...state, fields: fields(state.screen) }
      window.dispatchEvent(new CustomEvent('rehearsal-transition', { detail: { from: state.screen, to: destination, action, origin, state: current } }))
    },
  })
  if (!state && project.adapter !== 'laundry') throw Error('The preview adapter did not publish a ready screen.')
  window.addEventListener('pagehide', () => { dispose?.(); delete window.reviewPreview }, { once: true })
} catch (error) {
  delete root.dataset.rehearsalReady
  root.replaceChildren()
  const heading = document.createElement('h1'); heading.textContent = 'Preview unavailable'
  const detail = document.createElement('p'); detail.setAttribute('role', 'alert'); detail.textContent = (error as Error).message
  root.append(heading, detail)
  const retries = Number(new URLSearchParams(location.search).get('mountRetry') ?? 0)
  if (/Failed to fetch dynamically imported module|Importing a module script failed/.test(detail.textContent) && retries < 2 && !window.reviewPreview?.state?.()) {
    detail.textContent = 'The preview compiler is updating. Retrying automatically…'
    const retry = new URL(location.href); retry.searchParams.set('mountRetry', String(retries + 1))
    setTimeout(() => location.replace(retry.href), 1000)
  }
}
