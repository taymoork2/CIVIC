import type { ReactNode, RefObject } from 'react'
import hostExtension from 'virtual:civic-canvas-extension'
import type { GraphFlow, MapScenario } from './app-map'

/**
 * A guided run: one flow a host plays continuously in its own frame, with presentation proposals
 * and captured visits. Module projects have none; Laundry's towel journey is one.
 */
export type GuidedSession = {
  flowId: string | null
  labels: { play: string; summary: string; live: string; retained: string }
  running: boolean
  current: string
  currentNode: { id: string }
  active?: { label: string }
  generation: number
  src: string
  frame: RefObject<HTMLIFrameElement | null>
  follow: { current: boolean }
  attach: () => void
  mode: 'play' | 'edit'
  setMode: (mode: 'play' | 'edit') => void
  setProperty: (property: 'screen' | 'action') => void
  candidate: boolean
  dirtyProposal: boolean
  proposal: { version: number }
  saving: boolean
  state: { dirty: boolean; pending: boolean } | null
  visits: { runId: string; from: string; to: string; capture?: string }[]
  runId: string
  snapshots: Map<string, { capture?: string }>
  play: () => void
  requestStart: (id: string) => void
  canStartAt: (id: string) => boolean
  notices: ReactNode
  inspector: ReactNode
}

/**
 * What a host's connector may add to the canvas, through the `virtual:civic-canvas-extension`
 * module. Every field is optional; a project without an extension gets CIVIC's own layout.
 */
export type CanvasExtension = {
  /** Its own grouping of screens into flows (the server's review adapter must agree). */
  journeyGraph?: (scenarios: MapScenario[], project?: { adapter: string }) => GraphFlow[]
  /** Orders flows and their screens in place. */
  arrange?: (flows: GraphFlow[]) => void
  /** Navigation section for a flow, when screens don't declare one. */
  sectionOf?: (flow: GraphFlow) => string
  sections?: string[]
  /** Screens drawn one lane down although they are on the main path. */
  lowered?: string[]
  /** The flow played as a guided run, and the hook that runs it. */
  guidedFlow?: string
  useGuidedSession?: (selection: string | null, enabled: boolean) => GuidedSession
  /** Scenarios that run through the project's preview adapter rather than a fixture frame. */
  adapterScenario?: (scenario: string) => boolean
  /** Extra query parameters forwarded to a scenario's fixture frame. */
  frameParams?: (scenario: string) => string[]
  /** Storage key for unsent review notes, kept for hosts with existing drafts. */
  draftKey?: string
  /** Host pages opened with `?<name>=1` in place of the canvas, such as Laundry's synthetic laundry day. */
  pages?: Record<string, () => Promise<unknown>>
}

export const extension: CanvasExtension = hostExtension

const noRun = { current: false }
const noFrame = { current: null }
const idle: GuidedSession = {
  flowId: null,
  labels: { play: 'Play', summary: '', live: 'Live session', retained: 'Captured reviews are retained.' },
  running: false, current: '', currentNode: { id: '' }, generation: 0, src: '', frame: noFrame, follow: noRun, attach() {},
  mode: 'play', setMode() {}, setProperty() {}, candidate: false, dirtyProposal: false, proposal: { version: 0 }, saving: false, state: null,
  visits: [], runId: '', snapshots: new Map(), play() {}, requestStart() {}, canStartAt: () => false, notices: null, inspector: null,
}

/** The host's guided run, or an idle one; fixed per page load, so the hook order never changes. */
export const useGuidedSession: (selection: string | null, enabled: boolean) => GuidedSession = extension.useGuidedSession ?? (() => idle)
