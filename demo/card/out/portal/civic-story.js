// <civic-story>: CIVIC's story player (decision 0013). Any page can host it, so the portal,
// a docs site and a wiki are all just hosts. The element's still arrives as server-rendered
// HTML in a declarative shadow root, so it shows without this script and its styles stay
// scoped. This script adds the upgrades, each on a person's request:
//
// - an island: the screen's own `mount(container, context)` module, the contract the journey
//   canvas mounts app screens with, imported and mounted live into this element's shadow
//   root with the stylesheets it names, so one component runs on the page without an iframe.
//   Each island imports its own module, so frameworks don't share a runtime with each other.
//   The context is a story's: the scenario, persona, role and condition, with no recording and
//   no backend; state and transitions the screen reports become `civic-story-state` events.
// - a frame: an isolated, sandboxed iframe, for a whole journey, a live runtime, a recorded
//   run or anything whose versions or global styles would clash on the host page.
//
// Another button brings the still back. Nothing plays until a person asks. No dependencies.
//
//   <civic-story story="story:..." step="target:..."
//                island='{"module": "...", "styles": ["..."], "label": "...", "note": "...", "scenario": {"id": "..."}, "persona": {...}, "role": {...}, "condition": {...}}'
//                frames='[{"src": "...", "label": "...", "note": "...", "sandbox": "allow-scripts"}]'>
//     <template shadowrootmode="open">...the still...</template>
//   </civic-story>
//
// One frame can also be given as `frame-src`, `frame-label`, `frame-note` and `frame-sandbox`.
// Modules load as ES modules, so an island needs the page served over HTTP; frames also open
// from disk. The element reflects its tier in a `tier` attribute (`still`, `island` or
// `frame`) and fires a `civic-story-tier` event when it changes.

const STYLE = `
.tiers { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.tiers button { font: inherit; font-size: 14px; border: 1px solid var(--accent, #2b5fd9); color: var(--accent, #2b5fd9); background: transparent; border-radius: 6px; padding: 5px 12px; cursor: pointer; }
.tiers .note { color: var(--muted, #5f5f5a); font-size: 13px; flex-basis: 100%; }
.island { display: block; border: 1px solid var(--line, #d9d9d4); border-radius: 10px; background: var(--panel, #fff); padding: 12px; overflow: auto; }
.island-error { color: var(--fail, #b3261e); font-size: 13px; }
iframe { display: block; width: 100%; height: var(--civic-story-frame-height, 640px); border: 1px solid var(--line, #d9d9d4); border-radius: 10px; background: var(--panel, #fff); }
[hidden] { display: none !important; }
`

class CivicStory extends HTMLElement {
  connectedCallback() {
    if (this.root) {
      if (this.controls && this.getAttribute('tier') !== 'still') this.showStill()
      return
    }
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
    const island = this.island()
    if (frames.length === 0 && !island) return

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
    const button = (label, play) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.textContent = label
      element.addEventListener('click', play)
      return element
    }
    const plays = [...(island ? [button(island.label || 'Run it here', () => this.showIsland(island))] : []), ...frames.map((frame) => button(frame.label || 'Play', () => this.showFrame(frame)))]
    const notes = () => [island, ...frames].map((option) => option?.note).filter(Boolean).join(' ')
    note.textContent = notes()
    bar.append(...plays, back, note)
    root.append(style, bar)
    this.controls = { plays, back, note, notes }
    back.addEventListener('click', () => this.showStill())
  }

  disconnectedCallback() {
    if (this.root && this.controls) this.clear()
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

  island() {
    const value = this.getAttribute('island')
    if (!value) return undefined
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed.module === 'string' ? parsed : undefined
    } catch {
      return undefined
    }
  }

  stills() {
    return [...this.root.children].filter((node) => node.tagName !== 'STYLE' && !node.classList.contains('tiers') && node.tagName !== 'IFRAME' && !node.classList.contains('island'))
  }

  clear() {
    this.root.querySelector('iframe')?.remove()
    const island = [...this.root.children].find((node) => node.classList.contains('island'))
    if (island) {
      try {
        this.dispose?.()
      } catch {
        // A screen that fails to clean up still leaves the story.
      }
      this.dispose = undefined
      island.remove()
    }
  }

  playing(note) {
    for (const node of this.stills()) node.hidden = true
    for (const play of this.controls.plays) play.hidden = true
    this.controls.back.hidden = false
    this.controls.note.textContent = note || ''
  }

  async showIsland(option) {
    this.clear()
    const holder = document.createElement('div')
    holder.className = 'island'
    holder.part = 'island'
    for (const href of option.styles || []) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = new URL(href, document.baseURI).href
      holder.append(link)
    }
    const container = document.createElement('div')
    holder.append(container)
    this.root.querySelector('.tiers').before(holder)
    this.playing(option.note)
    this.tier('island', option.module)
    const report = (detail) => this.dispatchEvent(new CustomEvent('civic-story-state', { detail: { story: this.getAttribute('story'), step: this.getAttribute('step'), ...detail }, bubbles: true }))
    // A story's context: the screen's scenario and presets, no recording and no backend.
    const context = {
      story: true,
      config: { scenario: option.scenario?.id, persona: option.persona?.id, role: option.role?.id, condition: option.condition?.id, theme: option.theme || 'light', textScale: 1, width: holder.clientWidth },
      scenario: option.scenario || {},
      persona: structuredClone(option.persona || {}),
      role: option.role || {},
      condition: option.condition || {},
      snapshot: undefined,
      recording: undefined,
      publish: (state) => report({ kind: 'state', state }),
      transition: (to, action) => report({ kind: 'transition', to, action }),
      connectRuntime: () => ({ recording: () => undefined, isReplaying: () => false }),
      startRuntime: async () => { throw new Error('A story island has no backend. Play the screen in a frame for a live run.') },
    }
    try {
      const module = await import(new URL(option.module, document.baseURI).href)
      if (typeof module.mount !== 'function') throw new Error(`${option.module} doesn't export mount(container, context).`)
      const dispose = await module.mount(container, context)
      this.dispose = typeof dispose === 'function' ? dispose : undefined
    } catch (error) {
      const message = document.createElement('p')
      message.className = 'island-error'
      message.textContent = `The island couldn't run: ${error instanceof Error ? error.message : String(error)}`
      container.replaceChildren(message)
    }
  }

  showFrame(option) {
    this.clear()
    const frame = document.createElement('iframe')
    frame.src = option.src
    frame.title = `${option.label || 'Story'}: ${this.getAttribute('step') || ''}`
    frame.setAttribute('sandbox', option.sandbox || 'allow-scripts')
    this.root.querySelector('.tiers').before(frame)
    this.playing(option.note)
    this.tier('frame', option.src)
  }

  showStill() {
    this.clear()
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
