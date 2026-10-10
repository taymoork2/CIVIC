import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { createElement } from 'react'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

const css = await readFile(new URL('../app.css', import.meta.url), 'utf8')
const { __unstable__loadDesignSystem } = createRequire(import.meta.url)('@tailwindcss/node') as typeof import('@tailwindcss/node')
const designSystem = await __unstable__loadDesignSystem(css, { base: fileURLToPath(new URL('../', import.meta.url)) })
const utilities = new Map<string, boolean>()

export function utilityCss(classes: string): string {
  return designSystem.candidatesToCss([...new Set(classes.split(/\s+/))]).filter(Boolean).join('\n')
}

/** Static tests assert content and behavior. Browser checks verify utility presentation. */
export function semanticMarkup(markup: string): string {
  return markup.replace(/<[a-z][^>]*>/g, (tag) => {
    const field = tag.includes('data-slot="field"')
    let result = tag.replace(/class="([^"]*)"/g, (_, value: string) => {
      const hooks = value.split(/\s+/).filter((token) => {
        if (!token) return false
        if (!utilities.has(token)) utilities.set(token, /^(?:group|peer)(?:\/|$)/.test(token) || designSystem.candidatesToCss([token.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&quot;', '"')])[0] !== null)
        return !utilities.get(token)
      })
      return `class="${[...new Set(hooks)].join(' ')}"`
    }).replace(/ data-(?:slot|variant|size|orientation)="[^"]*"/g, '')
    if (field) result = result.replace(' role="group"', '')
    if (result.startsWith('<button')) {
      const type = result.match(/ type="[^"]*"/)?.[0] ?? ''
      result = result.replace(type, '').replace('<button', '<button' + type)
      // Base UI Toggle writes its state attributes first and the class last: read a toggle in the
      // order a hand-written button has (type, class, the rest, pressed, disabled), and drop the
      // defaults it repeats (a button is focusable and enabled already).
      const pressed = result.match(/ aria-pressed="[^"]*"/)?.[0]
      if (pressed !== undefined) {
        const cls = result.match(/ class="[^"]*"/)?.[0] ?? ''
        const disabled = result.includes(' disabled=""') ? ' disabled=""' : ''
        for (const attribute of [' data-pressed=""', ' data-disabled=""', ' tabindex="0"', ' aria-disabled="false"', ' aria-disabled="true"', pressed, cls, disabled]) if (attribute) result = result.replace(attribute, '')
        result = result.replace(type, type + cls).replace(/(\/?>)$/, `${pressed}${disabled}$1`)
      }
    }
    return result
  })
}

export function renderToStaticMarkup(...args: Parameters<typeof render>): string {
  return semanticMarkup(render(...args))
}

/** Provide query context for static garment records; SSR starts no network subscription. */
export function renderWithConvex(element: Parameters<typeof render>[0]): string {
  const client = new ConvexReactClient('https://static-tests.invalid')
  return renderToStaticMarkup(createElement(ConvexProvider, { client, children: element }))
}
