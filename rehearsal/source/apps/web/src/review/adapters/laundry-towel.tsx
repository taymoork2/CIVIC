import { createRoot } from 'react-dom/client'
import { ConvexProvider } from 'convex/react'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { AddClothesFlow, emptyAddDraft, type IntakeReviewState, type IntakePresentation, type AddDraft } from '@/closet/add-clothes'
import { emptyTag } from '@/laundry/tag-step'
import { PreviewUnits } from '@/kit/units'
import { openLaundrySession } from './laundry-session'
import type { AdapterContext } from '@civic/canvas/adapter'
import type { RuntimeBridge, RuntimeGesture } from '@civic/canvas/runtime-bridge'
import { runtimeFields, replayGesture } from '@civic/canvas/runtime-dom'
import type { JourneyState } from '@civic/canvas/journey'
import nodes from '../towel-journey.json'
import { useSyncExternalStore, type ComponentProps, type ComponentType } from 'react'
import '@/app.css'
import '@/generated/tokens.css'

type ReviewProps = { initial: AddDraft; initialStep: NonNullable<ComponentProps<typeof import('@/closet/add-clothes').AddClothesSheet>['initialStep']>; initialCareStep?: 'wash' | 'bleach' | 'dry'; presentation: IntakePresentation; onReviewState: (state: IntakeReviewState) => void; onReviewTransition: (from: string, to: string) => void }
// The build plugin passes fixture props through the app's existing Flow; its mutation hooks stay native.
const ReviewFlow = AddClothesFlow as ComponentType<ComponentProps<typeof AddClothesFlow> & { review: ReviewProps }>
type Start = { branch: 'new' | 'pre-owned'; care: 'wash' | 'bleach' | 'dry' }

export async function mountTowelRuntime(container: HTMLElement, context: AdapterContext) {
  const params = new URLSearchParams(location.search)
  const saved = (context.recording?.seed as { application?: { start?: Start } } | undefined)?.application?.start
  const start: Start = saved ?? { branch: params.get('branch') === 'pre-owned' ? 'pre-owned' : 'new', care: params.get('care') === 'bleach' ? 'bleach' : params.get('care') === 'dry' ? 'dry' : 'wash' }
  const initialStep = context.scenario.id.split('.').at(-1)! as ReviewProps['initialStep']
  const initial: AddDraft = { ...structuredClone(emptyAddDraft), whose: 'shared', kind: 'towel', name: 'Cotton/polyester bath towel', colour: 'light', colorName: 'Gray', count: 1, dyeRun: 'unknown', material: 'cotton 80%, polyester 20%', stain: 'none', tag: ['type', 'whose', 'details', 'fabric', 'color'].includes(initialStep) ? emptyTag : { ...emptyTag, method: 'machine', dots: 1, bars: 0, bleach: 'none', dryer: 'low' }, ...(start.branch === 'pre-owned' ? { preOwned: { smell: null, fragile: false, heatTreat: false } } : {}) }
  const runtime = await openLaundrySession(context), root = createRoot(container)
  let incarnation = 0, state: IntakeReviewState | null = null, presentation: IntakePresentation = {}, version: number | null = null, bridge: RuntimeBridge | undefined
  let closed = false, lastAction = '', pendingCommand = Promise.resolve()
  let viewVersion = 0
  const viewListeners = new Set<() => void>()
  let ready!: () => void
  const firstState = new Promise<void>((resolve) => { ready = resolve })
  const route = () => `/rehearsal/towel/${state?.screen ?? (initialStep === 'care' ? `care:${start.care}` : initialStep)}`
  const currentNode = () => nodes.find((node) => node.id === state?.screen) ?? nodes.find((node) => node.id === (initialStep === 'care' ? `care:${start.care}` : initialStep)) ?? nodes[0]!
  const journeyState = (): JourneyState | null => state && { ...state, fields: runtimeFields(document.body), title: document.querySelector('[role="dialog"] h2')?.textContent ?? '', action: document.querySelector('button[type="submit"]')?.textContent ?? '', proposalVersion: version }
  const refresh = () => { if (state) window.dispatchEvent(new CustomEvent('journey-state', { detail: journeyState() })) }
  const onReviewState = (next: IntakeReviewState) => { state = next; ready(); refresh() }
  const transition = (from: string, to: string) => {
    if (!bridge?.isReplaying()) window.dispatchEvent(new CustomEvent('journey-transition', { detail: { from, to, state: journeyState(), fields: runtimeFields(document.body), action: lastAction || journeyState()?.action || 'Application transition' } }))
    lastAction = ''
  }
  const close = () => { if (state) { transition(state.screen, 'closed'); state = { ...state, screen: 'closed', dirty: false, pending: false }; refresh() }; closed = true; render() }
  const View = () => {
    useSyncExternalStore((listener) => { viewListeners.add(listener); return () => { viewListeners.delete(listener) } }, () => viewVersion)
    return closed ? <div className="page"><h1>Preview closed</h1><p>Saved isolated records are retained in this run.</p></div> : <ReviewFlow key={incarnation} householdId={runtime.session.seed.householdId} mode={{ kind: 'add', target: 'closet' }} review={{ initial, initialStep, initialCareStep: start.care, presentation, onReviewState, onReviewTransition: transition }} onClose={close} />
  }
  const render = () => { viewVersion++; root.render(<ConvexProvider client={runtime.client}><PreviewUnits><RouterProvider router={router} /><Toaster position="top-center" /></PreviewUnits></ConvexProvider>); for (const listener of viewListeners) listener() }
  const router = createRouter({ history: createMemoryHistory({ initialEntries: ['/'] }), routeTree: createRootRoute({ component: View }) })
  const validate = (value: unknown): { edits: IntakePresentation; version: number | null } => {
    const candidate = value as { edits: IntakePresentation; version: number | null }
    if (!candidate || !candidate.edits || Array.isArray(candidate.edits) || typeof candidate.edits !== 'object' || !(candidate.version === null || Number.isSafeInteger(candidate.version) && candidate.version >= 0) || Object.entries(candidate.edits).some(([id, edit]) => !nodes.some((node) => node.id === id) || !edit || Array.isArray(edit) || typeof edit !== 'object' || Object.entries(edit).some(([key, word]) => !['title', 'action', 'color'].includes(key) || typeof word !== 'string' || (key === 'color' ? !/^#[a-f0-9]{6}$/i.test(word) : word.length > 160)))) throw Error('Invalid proposal presentation command')
    return structuredClone(candidate)
  }
  const command = async (gesture: RuntimeGesture) => {
    if (gesture.target?.name === 'presentation') {
      const next = validate(JSON.parse(gesture.value!)); presentation = next.edits; version = next.version; render()
    } else if (gesture.target?.name === 'retryWrites' && gesture.value === 'null') {
      await runtime.transport.request('recover'); document.documentElement.dataset.reviewCondition = 'normal'
    } else throw Error('Unsupported towel runtime command')
  }
  const perform = (name: string, value: unknown) => {
    if (!bridge || bridge.isReplaying()) return
    const gesture = { kind: 'command', target: { tag: 'adapter', name, index: 0, count: 1 }, value: JSON.stringify(value) }
    bridge.record(gesture)
    pendingCommand = command(gesture)
    void bridge.flush().then(refresh).catch((error) => { container.dataset.rehearsalRunError = error.message })
  }
  const rememberAction = (event: MouseEvent) => { lastAction = (event.target as Element).closest('button')?.getAttribute('aria-label') || (event.target as Element).closest('button')?.textContent?.trim() || '' }
  const observer = new MutationObserver(refresh)
  const dispose = () => { observer.disconnect(); document.removeEventListener('click', rememberAction, true); root.unmount(); delete window.guidedJourney; runtime.close() }
  try {
    render(); await router.load(); await firstState; await runtime.settle()
    bridge = context.connectRuntime({ seed: { ...runtime.seed, start }, now: runtime.session.now, route, screen: () => currentNode().scenario, captureInputs: 'synthetic', status: () => ({ dirty: state?.dirty ?? false, pending: state?.pending ?? false }), data: () => ({ ...runtime.data(), path: route(), draft: state?.draft }), assertSource: runtime.assertSource,
      settle: async () => { await pendingCommand; await runtime.settle() },
      interact: async (gesture) => { if (gesture.kind === 'command') await command(gesture); else await replayGesture(document.body, gesture) },
      reset: async () => { await runtime.reset(); incarnation++; state = null; closed = false; presentation = {}; version = null; pendingCommand = Promise.resolve(); render(); await runtime.settle() },
    })
    runtime.transport.bind(bridge)
    window.guidedJourney = { state: journeyState, snapshot: context.snapshot, setPresentation: (edits, nextVersion) => { const next = validate({ edits, version: nextVersion }); if (JSON.stringify(next) !== JSON.stringify({ edits: presentation, version })) perform('presentation', next) } }
    window.reviewPreview!.retryWrites = () => perform('retryWrites', null)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true }); document.addEventListener('click', rememberAction, true)
    refresh()
    return dispose
  } catch (error) { dispose(); throw error }
}
