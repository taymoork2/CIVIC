// <civic-story>: CIVIC's story player (decision 0013). Any page can host it, so the portal,
// a docs site and a wiki are all just hosts. The element's still arrives as server-rendered
// HTML in a declarative shadow root, so it shows without this script and its styles stay
// scoped. This script adds the upgrade: for each frame the step names, a button swaps the
// still for that frame in an isolated, sandboxed iframe, and another brings the still back.
// Each frame is its own document, so stories on different frameworks or versions never share
// a runtime. Nothing plays until a person asks. No dependencies.
//
//   <civic-story story="story:..." step="target:..." frames='[{"src": "...", "label": "...", "note": "...", "sandbox": "allow-scripts"}]'>
//     <template shadowrootmode="open">...the still...</template>
//   </civic-story>
//
// One frame can also be given as `frame-src`, `frame-label`, `frame-note` and `frame-sandbox`.
// The element reflects its tier in a `tier` attribute (`still` or `frame`) and fires a
// `civic-story-tier` event, with the frame's src, when it changes.

const STYLE = `
.tiers { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.tiers button { font: inherit; font-size: 14px; border: 1px solid var(--accent, #2b5fd9); color: var(--accent, #2b5fd9); background: transparent; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.tiers .note { color: var(--muted, #5f5f5a); font-size: 13px; flex-basis: 100%; }
iframe { display: block; width: 100%; height: var(--civic-story-frame-height, 640px); border: 1px solid var(--line, #d9d9d4); border-radius: 10px; background: var(--panel, #fff); }
[hidden] { display: none !important; }
`

class CivicStory extends HTMLElement {
  connectedCallback() {
    if (this.root) return
    // A browser without declarative shadow DOM leaves the template as a child: attach it here.
    let root = this.shadowRoot
    if (!root) {
      root = this.attachShadow({ mode: 'open' })
      const template = this.querySelector(':scope > template[shadowrootmode]')
      if (template) {
        root.append(template.content.cloneNode(true))
        template.remove()
      }
    }
    this.root = root
    this.setAttribute('tier', 'still')
    const frames = this.frames()
    if (frames.length === 0) return

    const style = document.createElement('style')
    style.textContent = STYLE
    const bar = document.createElement('div')
    bar.className = 'tiers'
    bar.part = 'tiers'
    const back = document.createElement('button')
    back.type = 'button'
    back.textContent = 'Show the still'
    back.hidden = true
    const note = document.createElement('span')
    note.className = 'note'
    const plays = frames.map((frame) => {
      const play = document.createElement('button')
      play.type = 'button'
      play.textContent = frame.label || 'Play'
      play.addEventListener('click', () => this.showFrame(frame))
      return play
    })
    const notes = () => frames.map((frame) => frame.note).filter(Boolean).join(' ')
    note.textContent = notes()
    bar.append(...plays, back, note)
    root.append(style, bar)
    this.controls = { plays, back, note, notes }
    back.addEventListener('click', () => this.showStill())
  }

  frames() {
    const list = this.getAttribute('frames')
    if (list) {
      try {
        const parsed = JSON.parse(list)
        if (Array.isArray(parsed)) return parsed.filter((frame) => frame && typeof frame.src === 'string')
      } catch {
        return []
      }
    }
    const src = this.getAttribute('frame-src')
    return src ? [{ src, label: this.getAttribute('frame-label'), note: this.getAttribute('frame-note'), sandbox: this.getAttribute('frame-sandbox') }] : []
  }

  stills() {
    return [...this.root.children].filter((node) => node.tagName !== 'STYLE' && !node.classList.contains('tiers') && node.tagName !== 'IFRAME')
  }

  showFrame(option) {
    this.root.querySelector('iframe')?.remove()
    const frame = document.createElement('iframe')
    frame.src = option.src
    frame.title = `${option.label || 'Story'}: ${this.getAttribute('step') || ''}`
    frame.setAttribute('sandbox', option.sandbox || 'allow-scripts')
    for (const node of this.stills()) node.hidden = true
    this.root.querySelector('.tiers').before(frame)
    for (const play of this.controls.plays) play.hidden = true
    this.controls.back.hidden = false
    this.controls.note.textContent = option.note || ''
    this.tier('frame', option.src)
  }

  showStill() {
    this.root.querySelector('iframe')?.remove()
    for (const node of this.stills()) node.hidden = false
    for (const play of this.controls.plays) play.hidden = false
    this.controls.back.hidden = true
    this.controls.note.textContent = this.controls.notes()
    this.tier('still')
  }

  tier(name, src) {
    this.setAttribute('tier', name)
    this.dispatchEvent(new CustomEvent('civic-story-tier', { detail: { tier: name, story: this.getAttribute('story'), step: this.getAttribute('step'), ...(src ? { src } : {}) }, bubbles: true }))
  }
}

if (!customElements.get('civic-story')) customElements.define('civic-story', CivicStory)
