import type { IntakePresentation, IntakeReviewState } from '@/closet/add-clothes'
import type { ReviewSnapshot } from './store'
import nodes from './towel-journey.json'

export const towelEdges = [...nodes.slice(0, -1).flatMap((node, i) => node.id === 'origin' ? [{ from: 'origin', to: 'dye', label: 'Newly owned' }, { from: 'origin', to: 'care:wash', label: 'Pre-owned · skip dye' }] : [{ from: node.id, to: nodes[i + 1]!.id, label: node.id === 'fabric' ? 'Next: color' : node.id === 'color' ? 'Next: where from' : 'Continue' }]), { from: 'care:wash', to: 'stain', label: 'Do not wash / dry clean only' }]

export type Proposal = { id: string; version: number; title: string; edits: IntakePresentation; updatedAt: string; source: string }
export type JourneyState = IntakeReviewState & { fields: { label: string; value: string }[]; title: string; action: string; proposalVersion: number | null }
export type JourneyVisit = { id: string; runId: string; source: string; from: string; to: string; action: string; fields: JourneyState['fields']; draft: IntakeReviewState['draft']; at: string; capture?: string; captureError?: string; proposalVersion: number | null }
export type JourneyBridge = {
  state: () => JourneyState | null
  setPresentation: (edits: IntakePresentation, version: number | null) => void
  snapshot: ReviewSnapshot
}
declare global { interface Window { towelJourney?: JourneyBridge } }

export const screenId = (value: string) => value === 'care' ? 'care:wash' : value
export function readFixtureFields(doc: Document): JourneyState['fields'] {
  // Only the isolated intake's editable form fields; never credentials, files or hidden values.
  const fields = [...doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')]
    .filter((element) => !['password', 'file', 'hidden'].includes(element.type) && element.getBoundingClientRect().width > 0)
    .map((element) => {
      const role = element.closest('[role="checkbox"], [role="radio"], label')
      const labelled = (role?.getAttribute('aria-labelledby') ?? element.getAttribute('aria-labelledby'))?.split(' ').map((id) => doc.getElementById(id)?.textContent).join(' ').trim()
      return { label: (element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent?.trim() ?? role?.getAttribute('aria-label') ?? labelled ?? element.id) || 'Field', value: ['radio', 'checkbox'].includes(element.type) ? String((element as HTMLInputElement).checked) : element.value }
    })
  const choices = [...doc.querySelectorAll<HTMLElement>('[role="radio"], [role="checkbox"]')].filter((element) => element.tagName !== 'INPUT' && element.getBoundingClientRect().width > 0).map((element) => {
    const labelled = element.getAttribute('aria-labelledby')?.split(' ').map((id) => doc.getElementById(id)?.textContent).join(' ').trim()
    return { label: (element.getAttribute('aria-label') ?? labelled ?? element.textContent?.trim()) || 'Choice', value: element.getAttribute('aria-checked') ?? 'false' }
  })
  return [...fields, ...choices]
}
