import html from './design.html?raw'
import receipt from './receipt.json'

export function mount(container, context) {
  const { family, state } = context.scenario.fixture
  const note = document.createElement('p')
  note.textContent = 'Orca design proposal · fixture jump only. Runtime, approval, adoption and physical-device acceptance are unverified.'
  note.style.cssText = 'font:14px/1.5 system-ui;padding:12px;background:#f1f3f8;color:#253147'
  const frame = document.createElement('iframe')
  frame.title = `Orca design · ${family}/${state}`
  frame.sandbox = 'allow-scripts'
  frame.style.cssText = 'width:100%;height:100vh;min-height:720px;border:0'
  frame.srcdoc = html.replace('<!-- CIVIC_ROUTE -->', `<script>location.hash=${JSON.stringify(`#/${family}/${state}`)}</script>`)
  const details = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('pre')
  summary.textContent = 'Design provenance and declared journeys'
  text.textContent = JSON.stringify(receipt, null, 2)
  text.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace'
  details.append(summary, text)
  container.append(note, frame, details)
  context.publish({ screen: context.scenario.id, dirty: false, pending: false })
  return () => container.replaceChildren()
}
