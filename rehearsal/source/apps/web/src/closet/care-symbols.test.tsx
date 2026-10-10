import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { CareSymbol, CareSymbolGallery, careSymbolKinds } from '@/closet/care-symbols'
import { careSymbolWords } from '@/copy'
import { assertPlainCopy } from '@/kit/test-copy'

const names = (markup: string) => [...markup.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1])

test('every symbol has words, in the order a tag reads', () => {
  expect(Object.keys(careSymbolWords)).toEqual([...careSymbolKinds])
  expect(new Set(Object.values(careSymbolWords)).size).toBe(careSymbolKinds.length)
})

test('every symbol draws, and screen readers hear its words', () => {
  const spoken = careSymbolKinds.map((kind) => {
    const markup = renderToStaticMarkup(<CareSymbol kind={kind} />)
    expect(markup).toMatch(/^<svg [^>]*viewBox="0 0 32 32"/)
    expect(markup).toContain('width="32" height="32"')
    expect(markup).toContain('stroke="currentColor"')
    expect(markup).toContain('stroke-width="1.75"')
    expect(markup).toContain('role="img"')
    expect(markup).not.toContain('aria-hidden')
    expect(markup).toMatch(/<(path|circle|rect) /)
    assertPlainCopy(markup)
    return names(markup)[0]
  })
  expect(spoken).toMatchInlineSnapshot(`
    [
      "Machine wash",
      "Machine wash, cold",
      "Machine wash, warm",
      "Machine wash, hot",
      "Machine wash, very hot",
      "Machine wash, very hot (160°F)",
      "Machine wash, very hot (200°F)",
      "Machine wash, permanent press",
      "Machine wash, delicate",
      "Machine wash, cold, permanent press",
      "Machine wash, cold, delicate",
      "Machine wash, warm, permanent press",
      "Machine wash, warm, delicate",
      "Machine wash, hot, permanent press",
      "Machine wash, hot, delicate",
      "Machine wash, very hot, permanent press",
      "Machine wash, very hot, delicate",
      "Machine wash, very hot (160°F), permanent press",
      "Machine wash, very hot (160°F), delicate",
      "Machine wash, very hot (200°F), permanent press",
      "Machine wash, very hot (200°F), delicate",
      "Hand wash",
      "Do not wash",
      "Any bleach",
      "Non-chlorine bleach only",
      "Do not bleach",
      "Tumble dry",
      "Tumble dry, low heat",
      "Tumble dry, medium heat",
      "Tumble dry, high heat",
      "Tumble dry, no heat",
      "Do not tumble dry",
      "Line dry",
      "Drip dry",
      "Dry flat",
      "Iron, low heat",
      "Iron, medium heat",
      "Iron, high heat",
      "Do not iron",
      "Steam allowed",
      "Do not steam",
      "Dry clean",
      "Professional dry clean, P",
      "Do not dry clean",
    ]
  `)
})

test('no two symbols draw the same', () => {
  const drawings = careSymbolKinds.map((kind) => renderToStaticMarkup(<CareSymbol kind={kind} decorative />).replace(/data-symbol="[^"]*"/, ''))
  expect(new Set(drawings).size).toBe(careSymbolKinds.length)
})

const dotCount = (markup: string) => (markup.match(/r="1.35"/g) ?? []).length
const barCount = (markup: string) => (markup.match(/d="M6.5 (26.5|30)h19"/g) ?? []).length
const crossed = (markup: string) => markup.includes('d="M5 5 27 27M27 5 5 27"')

test('the P-labelled choice carries its letter without assigning a process to generic dry-clean records', () => {
  const p = renderToStaticMarkup(<CareSymbol kind="dry_clean_p" />)
  expect(p).toContain('r="11.5"')
  expect(p).toContain('<path')
  expect(renderToStaticMarkup(<CareSymbol kind="dry_clean" />)).not.toContain('<path')
})

test('the tub carries its water dots and cycle bars', () => {
  for (const dots of [1, 2, 3, 4, 5, 6] as const) {
    expect(dotCount(renderToStaticMarkup(<CareSymbol kind={`wash_${dots}`} />))).toBe(dots)
    const delicate = renderToStaticMarkup(<CareSymbol kind={`wash_${dots}_delicate`} />)
    expect([dotCount(delicate), barCount(delicate)]).toEqual([dots, 2])
    const permanentPress = renderToStaticMarkup(<CareSymbol kind={`wash_${dots}_permanent_press`} />)
    expect([dotCount(permanentPress), barCount(permanentPress)]).toEqual([dots, 1])
  }
  const plain = renderToStaticMarkup(<CareSymbol kind="wash" />)
  expect([dotCount(plain), barCount(plain), crossed(plain)]).toEqual([0, 0, false])
  expect(barCount(renderToStaticMarkup(<CareSymbol kind="wash_permanent_press" />))).toBe(1)
  expect(barCount(renderToStaticMarkup(<CareSymbol kind="wash_delicate" />))).toBe(2)
})

test('heat dots, the filled no-heat drum, and the crossed-out symbols', () => {
  expect(['tumble_dry_low', 'tumble_dry_medium', 'tumble_dry_high', 'iron_low', 'iron_medium', 'iron_high'].map((kind) => dotCount(renderToStaticMarkup(<CareSymbol kind={kind as never} />)))).toEqual([1, 2, 3, 1, 2, 3])
  expect(renderToStaticMarkup(<CareSymbol kind="tumble_dry_no_heat" />)).toContain('r="8.5" fill="currentColor"')
  expect(renderToStaticMarkup(<CareSymbol kind="tumble_dry" />)).not.toContain('fill="currentColor"')
  const crossedKinds = careSymbolKinds.filter((kind) => crossed(renderToStaticMarkup(<CareSymbol kind={kind} />)))
  expect(crossedKinds).toEqual(['do_not_wash', 'do_not_bleach', 'do_not_tumble_dry', 'do_not_iron', 'do_not_steam', 'do_not_dry_clean'])
  for (const kind of crossedKinds) expect(careSymbolWords[kind]).toMatch(/^Do not /)
})

test('a decorative symbol is hidden from screen readers, and size scales the drawing', () => {
  const markup = renderToStaticMarkup(<CareSymbol kind="dry_flat" decorative size={20} className="tag-row-symbol" />)
  expect(markup).toContain('aria-hidden="true"')
  expect(markup).not.toContain('aria-label')
  expect(markup).not.toContain('role=')
  expect(markup).toContain('width="20" height="20"')
  expect(markup).toContain('viewBox="0 0 32 32"')
  expect(markup).toContain('class="care-symbol tag-row-symbol"')
})

test('the gallery shows every symbol beside its words', () => {
  const markup = renderToStaticMarkup(<CareSymbolGallery />)
  expect((markup.match(/<li>/g) ?? []).length).toBe(careSymbolKinds.length)
  for (const kind of careSymbolKinds) expect(markup).toContain(`<span>${careSymbolWords[kind]}</span>`)
  assertPlainCopy(markup)
})
