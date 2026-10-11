// CIVIC capture overlay (decision 0007, D40). Injected into dev and preview builds, never
// into production. Press Alt+Shift+C (or the CIVIC button), select an element or drag an
// area, and write a comment. The overlay records what a canvas capture records: the page's
// DOM for a deterministic screenshot, the element's role, accessible name, test ID and CIVIC
// IDs, the selection's rectangle, the viewport and the URL. The local `civic overlay` server
// turns it into an annotation in the store every worktree shares. No model call is made.
;(() => {
  if (window.__civicOverlay) return
  const script = document.currentScript
  const endpoint = new URL('annotate', script?.src ?? location.href).href
  const stamped = { line: script?.dataset.civicLine, revision: script?.dataset.civicRevision }

  const host = document.createElement('civic-overlay')
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>
    :host { all: initial; }
    .toggle, .panel, .toast { position: fixed; z-index: 2147483647; font: 14px/1.4 system-ui, sans-serif; color: #111; }
    .toggle { right: 12px; bottom: 12px; padding: 6px 10px; border-radius: 999px; border: 1px solid #555; background: #fff; cursor: pointer; }
    .toggle[aria-pressed="true"] { background: #111; color: #fff; }
    .box { position: fixed; z-index: 2147483646; pointer-events: none; outline: 2px solid #2563eb; background: rgb(37 99 235 / 0.12); display: none; }
    .shield { position: fixed; inset: 0; z-index: 2147483645; cursor: crosshair; display: none; }
    .panel { right: 12px; bottom: 56px; width: min(360px, calc(100vw - 24px)); padding: 12px; border-radius: 8px; background: #fff; border: 1px solid #555; box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); display: none; }
    .panel textarea { box-sizing: border-box; width: 100%; min-height: 80px; font: inherit; margin: 6px 0; }
    .panel button { font: inherit; padding: 4px 10px; margin-right: 6px; }
    .toast { left: 50%; bottom: 12px; transform: translateX(-50%); padding: 6px 12px; border-radius: 6px; background: #111; color: #fff; display: none; }
  </style>
  <div class="shield" part="shield"></div><div class="box"></div>
  <form class="panel" aria-label="CIVIC annotation"><strong>Comment on <span class="target"></span></strong>
    <textarea required maxlength="4000" aria-label="Comment"></textarea>
    <button type="submit">Save annotation</button><button type="button" class="cancel">Cancel</button></form>
  <button class="toggle" type="button" aria-pressed="false" title="Annotate for CIVIC (Alt+Shift+C)">CIVIC</button>
  <div class="toast" role="status"></div>`
  const $ = (selector) => root.querySelector(selector)
  const shield = $('.shield'), box = $('.box'), panel = $('.panel'), toggle = $('.toggle'), toast = $('.toast'), textarea = $('textarea')
  let selecting = false, selection = null, drag = null

  const IMPLICIT = { BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading', IMG: 'img', NAV: 'navigation', MAIN: 'main' }
  const INPUTS = { checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button', reset: 'button', range: 'slider' }
  const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim()
  function roleOf(element) {
    const explicit = element.getAttribute('role')
    if (explicit) return explicit.split(' ')[0]
    if (element.tagName === 'A' && element.hasAttribute('href')) return 'link'
    if (element.tagName === 'INPUT') return INPUTS[element.type] ?? 'textbox'
    return IMPLICIT[element.tagName]
  }
  function nameOf(element) {
    const labelledBy = element.getAttribute('aria-labelledby')
    if (labelledBy) return clean(labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent).join(' '))
    return clean(element.getAttribute('aria-label') || element.labels?.[0]?.textContent || element.getAttribute('alt') || element.getAttribute('title') || element.textContent).slice(0, 300)
  }
  /** IDs on the element or the nearest ancestor that carries them, but not the page itself. */
  function civicIdsOf(element) {
    for (let node = element; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const ids = node.getAttribute('data-civic-id')
      if (ids) return ids.split(/\s+/).filter(Boolean)
    }
    return []
  }
  function locatorOf(element) {
    const locator = {}
    const testId = element.closest('[data-testid]')
    if (testId === element) locator.testId = element.getAttribute('data-testid')
    const role = roleOf(element), name = nameOf(element)
    if (role && /^[a-z]{2,40}$/.test(role) && name) Object.assign(locator, { role, name })
    return Object.keys(locator).length ? locator : undefined
  }
  const normalized = (rect) => {
    const w = innerWidth, h = innerHeight
    const x = Math.max(0, Math.min(1, rect.left / w)), y = Math.max(0, Math.min(1, rect.top / h))
    return { x, y, width: Math.max(0.001, Math.min(1 - x, (Math.min(w, rect.right) - Math.max(0, rect.left)) / w)), height: Math.max(0.001, Math.min(1 - y, (Math.min(h, rect.bottom) - Math.max(0, rect.top)) / h)) }
  }
  const show = (rect) => Object.assign(box.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
  const under = (event) => { shield.style.display = 'none'; const element = document.elementFromPoint(event.clientX, event.clientY); shield.style.display = 'block'; return element }

  function setSelecting(on) {
    selecting = on
    toggle.setAttribute('aria-pressed', String(on))
    shield.style.display = on ? 'block' : 'none'
    if (!on && !selection) box.style.display = 'none'
  }
  function choose(next) {
    selection = next
    setSelecting(false)
    show(next.box)
    $('.target').textContent = next.label
    panel.style.display = 'block'
    textarea.focus()
  }
  function reset() {
    selection = null
    panel.style.display = 'none'
    box.style.display = 'none'
    textarea.value = ''
  }
  function say(message) {
    toast.textContent = message
    toast.style.display = 'block'
    clearTimeout(say.timer)
    say.timer = setTimeout(() => { toast.style.display = 'none' }, 4000)
  }

  shield.addEventListener('pointermove', (event) => {
    if (drag) return show({ left: Math.min(drag.x, event.clientX), top: Math.min(drag.y, event.clientY), width: Math.abs(event.clientX - drag.x), height: Math.abs(event.clientY - drag.y) })
    const element = under(event)
    if (element) show(element.getBoundingClientRect())
  })
  shield.addEventListener('pointerdown', (event) => { drag = { x: event.clientX, y: event.clientY }; shield.setPointerCapture(event.pointerId) })
  shield.addEventListener('pointerup', (event) => {
    const start = drag
    drag = null
    if (!start) return
    if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) >= 8) {
      const rect = { left: Math.min(start.x, event.clientX), top: Math.min(start.y, event.clientY), right: Math.max(start.x, event.clientX), bottom: Math.max(start.y, event.clientY) }
      return choose({ label: 'Selected area', box: { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }, rect: normalized(rect), targetIds: [] })
    }
    const element = under(event)
    if (!element) return
    const rect = element.getBoundingClientRect()
    const locator = locatorOf(element)
    choose({ label: locator?.name || element.tagName.toLowerCase(), box: rect, rect: normalized(rect), targetIds: civicIdsOf(element), locator })
  })
  toggle.addEventListener('click', () => { reset(); setSelecting(!selecting) })
  $('.cancel').addEventListener('click', reset)
  addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'KeyC') { event.preventDefault(); reset(); setSelecting(!selecting) }
    else if (event.key === 'Escape' && (selecting || selection)) { reset(); setSelecting(false) }
  }, true)

  /** The page as it looks now, for a deterministic screenshot with scripts disabled. */
  function snapshot() {
    const clone = document.documentElement.cloneNode(true)
    clone.querySelectorAll('script, iframe, noscript, civic-overlay').forEach((element) => element.remove())
    const fields = [...document.querySelectorAll('input, textarea, select')], copies = [...clone.querySelectorAll('input, textarea, select')]
    fields.forEach((field, index) => {
      const copy = copies[index]
      if (!copy) return
      if (field.tagName === 'TEXTAREA') copy.textContent = field.value
      else if (field.tagName === 'SELECT') [...copy.options].forEach((option) => option.toggleAttribute('selected', option.value === field.value))
      else if (field.type !== 'password' && field.type !== 'file') { copy.setAttribute('value', field.value); copy.toggleAttribute('checked', field.checked) }
    })
    let css = ''
    for (const sheet of document.styleSheets) {
      try { css += [...sheet.cssRules].map((rule) => rule.cssText).join('\n') } catch { /* a cross-origin sheet stays a link */ }
    }
    clone.querySelectorAll('link[rel="stylesheet"], style').forEach((element) => element.remove())
    const style = document.createElement('style'); style.textContent = css; clone.querySelector('head')?.append(style)
    const base = document.createElement('base'); base.href = document.baseURI; clone.querySelector('head')?.prepend(base)
    return '<!doctype html>' + clone.outerHTML
  }

  panel.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!selection || !textarea.value.trim()) return
    const body = {
      comment: textarea.value.trim(),
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      rect: { ...selection.rect, label: selection.label },
      targetIds: selection.targetIds,
      ...(selection.locator ? { locator: selection.locator } : {}),
      ...(stamped.line ? { line: stamped.line, revision: stamped.revision } : {}),
      html: snapshot(),
    }
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'CIVIC could not save the annotation.')
      reset()
      say(`Saved ${result.id.slice(0, 19)}… for any worktree to pick up.`)
    } catch (error) {
      say(`${error.message} Your comment is kept; retry.`)
    }
  })

  window.__civicOverlay = { version: 1 }
  ;(document.body ?? document.documentElement).append(host)
})()
