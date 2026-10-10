export function captureScreen(doc: Document) {
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
  return '<!doctype html>' + clone.outerHTML
}
