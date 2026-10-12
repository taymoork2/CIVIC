export function captureScreen(doc: Document, canvas?: HTMLElement) {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement
  const live = [...doc.documentElement.querySelectorAll<HTMLElement>('*')]
  const copies = [...clone.querySelectorAll<HTMLElement>('*')]
  live.forEach((element, i) => { if (element.scrollTop > 0) copies[i]?.setAttribute('data-review-scroll', String(element.scrollTop)) })
  clone.querySelectorAll('script, iframe, link, noscript, style').forEach((element) => element.remove())
  const fields = [...doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')]
  const clonedFields = [...clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')]
  fields.forEach((element, i) => {
    const copy = clonedFields[i]!
    if (element.tagName === 'INPUT') { const input = element as HTMLInputElement; copy.setAttribute('value', ['password', 'file', 'hidden'].includes(input.type) ? '' : input.value); if (input.checked) copy.setAttribute('checked', ''); else copy.removeAttribute('checked') }
    else if (element.tagName === 'TEXTAREA') copy.textContent = element.value
    else [...copy.querySelectorAll('option')].forEach((option) => { if (option.value === element.value) option.setAttribute('selected', ''); else option.removeAttribute('selected') })
  })
  const css = [...doc.styleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n').replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (_match, _quote, url) => `url("${new URL(url, sheet.href ?? doc.baseURI).href}")`)).join('\n')
  const style = doc.createElement('style'); style.textContent = css; clone.querySelector('head')!.append(style)
  const base = doc.createElement('base'); base.href = doc.baseURI; clone.querySelector('head')!.prepend(base)
  if (canvas) {
    const content = canvas.cloneNode(true) as HTMLElement
    content.querySelectorAll('iframe,script').forEach((element) => element.remove())
    clone.querySelector('body')!.replaceChildren(content)
    style.textContent += '\nbody{margin:0!important;overflow:hidden!important}.rh-canvas{width:100vw!important;height:100vh!important}'
    const originals = [...canvas.querySelectorAll('img')]
    content.querySelectorAll('img').forEach((image, index) => {
      const original = originals[index]!
      if (!original.complete || !original.naturalWidth) { image.replaceWith(doc.createTextNode('Screen snapshot')); return }
      const bounds = original.getBoundingClientRect()
      const bitmap = doc.createElement('canvas')
      bitmap.width = Math.max(1, Math.min(original.naturalWidth, Math.ceil(bounds.width)))
      bitmap.height = Math.max(1, Math.min(original.naturalHeight, Math.ceil(bounds.height)))
      bitmap.getContext('2d')!.drawImage(original, 0, 0, bitmap.width, bitmap.height)
      image.src = bitmap.toDataURL('image/png')
    })
  }
  clone.querySelectorAll('img').forEach((element) => element.removeAttribute('loading'))
  return '<!doctype html>' + clone.outerHTML
}
