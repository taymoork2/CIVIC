// <civic-story>: CIVIC's story player (decision 0013). Any page can host it, so the portal,
// a docs site and a wiki are all just hosts. The element's still arrives as server-rendered
// HTML in a declarative shadow root, so it shows without this script and its styles stay
// scoped. This script adds the upgrade: when the step names a frame (`frame-src`), a button
// swaps the still for that frame in an isolated, sandboxed iframe, and another brings the
// still back. Each frame is its own document, so stories on different frameworks or versions
// never share a runtime. Nothing plays until a person asks. No dependencies.
//
//   <civic-story story="story:..." step="target:..." frame-src="..." frame-label="..." frame-note="..." frame-sandbox="allow-scripts">
//     <template shadowrootmode="open">...the still...</template>
//   </civic-story>
//
// The element reflects its tier in a `tier` attribute (`still` or `frame`) and fires a
// `civic-story-tier` event when it changes.

const STYLE = `
.tiers { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.tiers button { font: inherit; font-size: 14px; border: 1px solid var(--accent, #2b5fd9); color: var(--accent, #2b5fd9); background: transparent; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.tiers .note { color: var(--muted, #5f5f5a); font-size: 13px; }
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
    const src = this.getAttribute('frame-src')
    if (!src) return

    const style = document.createElement('style')
    style.textContent = STYLE
    const bar = document.createElement('div')
    bar.className = 'tiers'
    bar.part = 'tiers'
    const play = document.createElement('button')
    play.type = 'button'
    play.textContent = this.getAttribute('frame-label') || 'Play'
    const back = document.createElement('button')
    back.type = 'button'
    back.textContent = 'Show the still'
    back.hidden = true
    const note = document.createElement('span')
    note.className = 'note'
    note.textContent = this.getAttribute('frame-note') || ''
    bar.append(play, back, note)
    root.append(style, bar)

    play.addEventListener('click', () => this.showFrame(src, play, back))
    back.addEventListener('click', () => this.showStill(play, back))
  }

  stills() {
    return [...this.root.children].filter((node) => node.tagName !== 'STYLE' && !node.classList.contains('tiers') && node.tagName !== 'IFRAME')
  }

  showFrame(src, play, back) {
    const frame = document.createElement('iframe')
    frame.src = src
    frame.title = `${this.getAttribute('frame-label') || 'Story'}: ${this.getAttribute('step') || ''}`
    frame.setAttribute('sandbox', this.getAttribute('frame-sandbox') || 'allow-scripts')
    frame.loading = 'lazy'
    for (const node of this.stills()) node.hidden = true
    this.root.querySelector('.tiers').before(frame)
    play.hidden = true
    back.hidden = false
    this.tier('frame')
  }

  showStill(play, back) {
    this.root.querySelector('iframe')?.remove()
    for (const node of this.stills()) node.hidden = false
    play.hidden = false
    back.hidden = true
    this.tier('still')
  }

  tier(name) {
    this.setAttribute('tier', name)
    this.dispatchEvent(new CustomEvent('civic-story-tier', { detail: { tier: name, story: this.getAttribute('story'), step: this.getAttribute('step') }, bubbles: true }))
  }
}

if (!customElements.get('civic-story')) customElements.define('civic-story', CivicStory)
