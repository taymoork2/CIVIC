// Exports Fluent's published web light theme (@fluentui/tokens) as a DTCG tokens file.
// Fluent's canonical token source is private (decision 0001), so CIVIC normalizes from the
// published package. Token paths stay Fluent's own names, so `tokens.colorBrandBackground`
// in code and `colorBrandBackground` in the file are the same string.
//
//   node export-tokens.mjs <out.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { webLightTheme } from '@fluentui/tokens'

const require = createRequire(import.meta.url)
const version = JSON.parse(readFileSync(require.resolve('@fluentui/tokens/package.json'), 'utf8')).version
const out = process.argv[2]
if (!out) throw new Error('Usage: node export-tokens.mjs <out.json>')

const tokens = {}
for (const name of Object.keys(webLightTheme).sort()) {
  tokens[name] = toDtcg(name, webLightTheme[name])
}

const document = {
  $description: `Fluent 2 web light theme, exported from @fluentui/tokens@${version} by CIVIC. MIT licensed, (c) Microsoft Corporation.`,
  $extensions: { 'civic.source': { tool: 'npm', package: '@fluentui/tokens', revision: `@fluentui/tokens@${version}`, theme: 'webLightTheme' } },
  ...tokens,
}
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`)
console.log(`Wrote ${Object.keys(tokens).length} tokens from @fluentui/tokens@${version} to ${out}`)

function toDtcg(name, value) {
  if (name.startsWith('color')) return { $type: 'color', $value: value }
  if (name.startsWith('shadow')) return { $type: 'shadow', $value: shadows(value) }
  if (name.startsWith('fontWeight')) return { $type: 'fontWeight', $value: Number(value) }
  if (name.startsWith('fontFamily')) return { $type: 'fontFamily', $value: value.split(',').map((family) => family.trim().replace(/^['"]|['"]$/g, '')) }
  if (name.startsWith('duration')) return { $type: 'duration', $value: value }
  if (name.startsWith('curve')) return { $type: 'cubicBezier', $value: value.match(/-?[\d.]+/g).map(Number) }
  if (/^(borderRadius|spacing|strokeWidth|fontSize|lineHeight)/.test(name)) return { $type: 'dimension', $value: value === '0' ? '0px' : value }
  throw new Error(`No DTCG type rule for ${name} (${value})`)
}

// "0 0 2px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.14)" -> DTCG shadow layers.
function shadows(css) {
  return css.split(/,(?![^(]*\))/).map((layer) => {
    const color = layer.match(/(rgba?\([^)]*\)|#[0-9a-f]+)/i)?.[0]
    const [offsetX, offsetY, blur, spread = '0px'] = layer.replace(color ?? '', '').trim().split(/\s+/).map((part) => (part === '0' ? '0px' : part))
    return { color, offsetX, offsetY, blur, spread }
  })
}
