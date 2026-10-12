import type { Presentation } from './adapter'
import type { ReviewSnapshot } from './store'
import nodes from './towel-journey.json'

export { towelEdges } from './journey-graph.mjs'

export type Proposal = { id: string; version: number; title: string; edits: Presentation; updatedAt: string; source: string }
export type JourneyState = { screen: string; draft: unknown; dirty: boolean; pending: boolean; error: string | null; fields: { label: string; value: string }[]; title: string; action: string; proposalVersion: number | null }
export type JourneyVisit = { id: string; runId: string; source: string; from: string; to: string; action: string; fields: JourneyState['fields']; draft: unknown; at: string; capture?: string; captureError?: string; proposalVersion: number | null }
export type JourneyBridge = {
  state: () => JourneyState | null
  setPresentation: (edits: Presentation, version: number | null) => void
  snapshot: ReviewSnapshot
}
declare global { interface Window { towelJourney?: JourneyBridge } }

export const screenId = (value: string) => value === 'care' ? 'care:wash' : value
export function readFixtureFields(doc: Document, scope: Document | HTMLElement = doc, allowed: (element: HTMLElement) => boolean = () => true): JourneyState['fields'] {
  // Only the isolated intake's editable form fields; never credentials, files or hidden values.
  const fields = [...scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')]
    .filter((element) => allowed(element) && !['password', 'file', 'hidden'].includes(element.type) && element.getBoundingClientRect().width > 0)
    .map((element) => {
      const role = element.closest('[role="checkbox"], [role="radio"], label')
      const labelled = (role?.getAttribute('aria-labelledby') ?? element.getAttribute('aria-labelledby'))?.split(' ').map((id) => doc.getElementById(id)?.textContent).join(' ').trim()
      return { label: (element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent?.trim() ?? role?.getAttribute('aria-label') ?? labelled ?? element.id) || 'Field', value: ['radio', 'checkbox'].includes(element.type) ? String((element as HTMLInputElement).checked) : element.value }
    })
  const choices = [...scope.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"], button[aria-pressed]')].filter((element) => allowed(element) && element.tagName !== 'INPUT' && element.getBoundingClientRect().width > 0).map((element) => {
    const labelled = element.getAttribute('aria-labelledby')?.split(' ').map((id) => doc.getElementById(id)?.textContent).join(' ').trim()
    return { label: (element.getAttribute('aria-label') ?? labelled ?? element.textContent?.trim()) || 'Choice', value: element.getAttribute('aria-checked') ?? element.getAttribute('aria-pressed') ?? 'false' }
  })
  return [...fields, ...choices]
}
