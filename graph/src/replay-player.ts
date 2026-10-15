// The replay player (decision 0013, after decision 0009): a recorded run's tape played back as
// a page, step by step: what the person did, where the app went, what it showed and what it
// wrote. It reads the tape the journey engine recorded and `civic share-replays` keeps by
// content hash, so it needs no running app and works the same for any platform whose runs are
// recorded. It shows the recording; it never runs it again. The tape stays the engine's
// format (decision 0009), so the shape below is only what the player reads. No model calls.

export interface RecordedTape {
  version: 1
  project: string
  /** The source fingerprint the run was recorded at. */
  source: string
  initialRoute: string
  steps: RecordedStep[]
}

export interface RecordedStep {
  gesture: { kind: string; value?: string; checked?: boolean; target?: { tag: string; name: string; index: number; count: number } }
  /** The route once the step settled. */
  route: string
  fields: { label: string; value: string }[]
  /** The visible headings, selected tab and pressed buttons, as the recorder's JSON list. */
  view: string
  operations: { kind: string; name: string; actor?: string; error?: string }[]
}

export interface ReplayPlayback {
  /** The tape's SHA-256, which names it in the store. */
  sha: string
  tape: RecordedTape
  title: string
  /** The latest replay of the tape, when there is one. */
  outcome?: 'pass' | 'fail'
  divergedAt?: number
  /** The commit it was replayed at. */
  head?: string
}

export const RECORDING_LABEL = 'A recorded run played back from its tape: what was done and what the app showed, as recorded. Nothing runs again here.'

/** Reads a tape loosely enough to show it, and refuses anything that isn't one. */
export function readTape(value: unknown): RecordedTape {
  const tape = value as RecordedTape
  if (!tape || tape.version !== 1 || typeof tape.project !== 'string' || typeof tape.source !== 'string' || typeof tape.initialRoute !== 'string' || !Array.isArray(tape.steps)) {
    throw new Error('That is not a recorded run: it needs version 1, its project, source, starting route and steps.')
  }
  for (const step of tape.steps) {
    if (!step?.gesture || typeof step.gesture.kind !== 'string' || typeof step.route !== 'string' || typeof step.view !== 'string' || !Array.isArray(step.fields) || !Array.isArray(step.operations)) {
      throw new Error('A step of that recorded run has no gesture, route, view, fields or operations.')
    }
  }
  return tape
}

/** One step's gesture in words, as a person would say what they did. */
export function describeGesture(gesture: RecordedStep['gesture']): string {
  const target = gesture.target
  const which = target && target.count > 1 ? ` (${target.index + 1} of ${target.count})` : ''
  const control = target ? `${target.tag === 'a' ? 'link' : target.tag} “${target.name}”${which}` : 'the page'
  if (gesture.kind === 'click') return `Clicked ${control}`
  if (gesture.kind === 'input') return gesture.checked !== undefined ? `${gesture.checked ? 'Checked' : 'Unchecked'} ${control}` : `Entered “${gesture.value ?? ''}” in ${control}`
  if (gesture.kind === 'key') return `Pressed ${gesture.value ?? 'a key'}`
  if (gesture.kind === 'command' && target) {
    let value: unknown
    try {
      value = JSON.parse(gesture.value ?? 'null')
    } catch {
      value = gesture.value
    }
    if (target.name === 'viewport' && value && typeof value === 'object') {
      const view = value as { width: number; height: number; theme: string; textScale: number; preset?: string }
      return `Changed the viewport to ${view.width}×${view.height}, ${view.theme}, text ×${view.textScale}${view.preset ? ` (${view.preset})` : ''}`
    }
    if (target.name === 'identity') return `Switched to the account ${String(value)}`
    if (target.name === 'connection') return value ? 'Came back online' : 'Went offline'
    if (target.name === 'time') return `Moved the clock on ${String(value)} minute${value === 1 ? '' : 's'}`
    if (target.name === 'applyPending') return `Applied the pending change ${String(value)}`
    if (target.name === 'discardPending') return `Discarded the pending change ${String(value)}`
    return `Ran the app's ${target.name} command`
  }
  return `${gesture.kind} on ${control}`
}

/** The view a step settled on, as its visible headings. A recorder that keeps plain text gives one entry. */
export function viewOf(step: RecordedStep): string[] {
  try {
    const view = JSON.parse(step.view) as unknown
    if (Array.isArray(view)) return view.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    // Not a JSON list: shown as it is.
  }
  return step.view.trim() ? [step.view.trim()] : []
}

/** The tape as a page that opens from disk: every step listed, and a step-through when scripts run. */
export function renderReplayPage(playback: ReplayPlayback): string {
  const { tape } = playback
  const status = playback.outcome === 'pass'
    ? `Replayed${playback.head ? ` at ${playback.head.slice(0, 12)}` : ''}: every step verified.`
    : playback.outcome === 'fail'
      ? `Replayed${playback.head ? ` at ${playback.head.slice(0, 12)}` : ''}: diverged at step ${playback.divergedAt ?? '?'}.`
      : 'Not replayed yet.'
  const steps = tape.steps.map((step, index) => {
    const view = viewOf(step)
    const diverged = playback.outcome === 'fail' && playback.divergedAt === index + 1
    return `<li class="step${diverged ? ' diverged' : ''}" data-step="${index + 1}">
<h2>Step ${index + 1} of ${tape.steps.length}: ${escapeHtml(describeGesture(step.gesture))}</h2>
${diverged ? '<p class="warn">The latest replay diverged here: the app did not do what it did when this was recorded.</p>' : ''}
<p class="muted">Then on <code>${escapeHtml(step.route || '/')}</code></p>
${view.length > 0 ? `<p>Showing: ${view.map((item) => `<strong>${escapeHtml(item)}</strong>`).join(', ')}</p>` : ''}
${step.fields.length > 0 ? `<details><summary>Fields (${step.fields.length})</summary><dl>${step.fields.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value || '(empty)')}</dd></div>`).join('')}</dl></details>` : ''}
${step.operations.length > 0 ? `<p>Wrote: ${step.operations.map((operation) => `<code>${escapeHtml(operation.name)}</code>${operation.actor ? ` as ${escapeHtml(operation.actor)}` : ''}${operation.error ? ` <span class="warn">failed: ${escapeHtml(operation.error)}</span>` : ''}`).join(', ')}</p>` : ''}
</li>`
  })
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recorded run: ${escapeHtml(playback.title)}</title>
<style>
:root { --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --muted: #5f5f5a; --line: #d9d9d4; --accent: #2b5fd9; --warn: #9a5b00; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --panel: #20201f; --text: #ededea; --muted: #a5a59f; --line: #3a3a37; --accent: #8fb0ff; --warn: #f0b45c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 0 0 4px; }
.label { border: 1px solid var(--warn); color: var(--warn); border-radius: 6px; padding: 6px 10px; font-size: 13px; margin: 8px 0 16px; }
.muted { color: var(--muted); font-size: 13px; }
.warn { color: var(--warn); }
ol { list-style: none; padding: 0; display: grid; gap: 10px; }
.step { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.step.diverged { border-color: var(--warn); }
.step p { margin: 4px 0; }
dl { margin: 6px 0 0; display: grid; gap: 2px; }
dl div { display: flex; gap: 8px; flex-wrap: wrap; }
dt { color: var(--muted); }
dd { margin: 0; }
nav { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
button { font: inherit; border: 1px solid var(--accent); color: var(--accent); background: transparent; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
button[disabled] { border-color: var(--line); color: var(--muted); cursor: not-allowed; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<main>
<h1>Recorded run: ${escapeHtml(playback.title)}</h1>
<p class="label">${escapeHtml(RECORDING_LABEL)}</p>
<p class="muted">${escapeHtml(status)} Starts on <code>${escapeHtml(tape.initialRoute || '/')}</code>. Tape <code>${escapeHtml(playback.sha.slice(0, 16))}</code>, recorded at source <code>${escapeHtml(tape.source.slice(0, 12))}</code>.</p>
<nav hidden id="controls"><button id="back" type="button">Back</button><button id="next" type="button">Next step</button><button id="all" type="button">Show every step</button><span class="muted" id="where"></span></nav>
${tape.steps.length > 0 ? `<ol id="steps">\n${steps.join('\n')}\n</ol>` : '<p>This recording has no steps: it opens on its starting route and stops.</p>'}
</main>
<script>
const steps = [...document.querySelectorAll('.step')]
if (steps.length > 0) {
  const controls = document.getElementById('controls')
  const opened = Number((location.hash.match(/^#step=(\\d+)$/) || [])[1] || 1)
  let at = Math.min(Math.max(opened, 1), steps.length)
  let all = false
  const show = () => {
    steps.forEach((step, index) => { step.hidden = !all && index + 1 !== at })
    document.getElementById('back').disabled = all || at <= 1
    document.getElementById('next').disabled = all || at >= steps.length
    document.getElementById('all').textContent = all ? 'Step through' : 'Show every step'
    document.getElementById('where').textContent = all ? steps.length + ' steps' : 'Step ' + at + ' of ' + steps.length
  }
  document.getElementById('back').onclick = () => { at--; show() }
  document.getElementById('next').onclick = () => { at++; show() }
  document.getElementById('all').onclick = () => { all = !all; show() }
  controls.hidden = false
  show()
}
</script>
</body>
</html>
`
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
