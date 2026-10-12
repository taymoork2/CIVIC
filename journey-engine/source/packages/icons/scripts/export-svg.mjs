// Writes one SVG per icon to ../svg/ (stroke currentColor, width 1.6, round caps and joins).
// Run with a Node that strips types: node --experimental-strip-types scripts/export-svg.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const { iconPaths } = await import('../src/index.ts')
const out = new URL('../svg/', import.meta.url)
mkdirSync(out, { recursive: true })
for (const [name, d] of Object.entries(iconPaths)) {
  writeFileSync(new URL(`${name}.svg`, out), `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>\n`)
}
console.log(`wrote ${Object.keys(iconPaths).length} svgs`)
