/**
 * Test helper: the words no screen may show. Planner and storage vocabulary stays behind the
 * screens, and "HE" appears only as the logo picture (which draws a lowercase "he"). "Capacity" is
 * allowed: the October 1 design says "Capacity unknown · fit not checked" rather than hide it.
 */
export const bannedWords = /evidence|verified|observed|placement|specificity|load unit|rule|fixture|bulk/i
export const bannedHe = /\bHE\b/

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' }
const decode = (text: string) => text.replace(/&(#?\w+);/g, (whole, name: string) => entities[name] ?? whole)

/**
 * What a person can read or hear from rendered markup: its text nodes, plus the attributes a screen
 * reader speaks or a field shows (aria-label, alt, title, placeholder). Class names and ids are not
 * read, so they may use any word.
 */
export function readableText(markup: string): string {
  const spoken = [...markup.matchAll(/\s(?:aria-label|alt|title|placeholder)="([^"]*)"/g)].map((match) => match[1])
  const text = markup.replace(/<[^>]*>/g, ' ')
  return decode([text, ...spoken].join(' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Throws when the rendered screen shows a banned word. Pass markup from `renderToStaticMarkup`, or
 * anything with `textContent` (a DOM node).
 */
export function assertPlainCopy(container: string | { readonly textContent: string | null }): void {
  const text = typeof container === 'string' ? readableText(container) : container.textContent ?? ''
  const found = [...new Set([...(text.match(new RegExp(bannedWords.source, 'gi')) ?? []), ...(text.match(new RegExp(bannedHe.source, 'g')) ?? [])])]
  if (found.length > 0) throw new Error(`The screen shows words people should not see: ${found.join(', ')}\n${text}`)
}
