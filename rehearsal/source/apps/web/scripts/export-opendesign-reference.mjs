#!/usr/bin/env node
// Export synthetic React previews with the CSS the browser actually received.
// This is a static implementation reference, not another implementation of the UI.
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { referenceInputHashes } from './opendesign-reference-inputs.mjs'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.env.OD_REFERENCE_OUTPUT ?? join(webRoot, '.data/opendesign-source-reference'))
const base = new URL(process.env.OD_REFERENCE_BASE_URL ?? 'http://127.0.0.1:3005')
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Use a local synthetic preview server.')
const hash = (value) => createHash('sha256').update(value).digest('hex')
// Conservative invalidation: changes to another shared UI or fixture also
// invalidate the baseline, rather than guessing each route's dependencies.
const sourceHashes = await referenceInputHashes(webRoot)
const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: webRoot, encoding: 'utf8' }).trim()
const defaultCases = [
  { name: 'drying-phone-light', screen: 'drying-home', width: 393, height: 852, theme: 'light', scale: 1 },
  { name: 'drying-phone-dark', screen: 'drying-home', width: 393, height: 852, theme: 'dark', scale: 1 },
  { name: 'drying-large-text', screen: 'drying-home', width: 320, height: 852, theme: 'dark', scale: 2 },
  { name: 'drying-wide', screen: 'drying-home', width: 1024, height: 900, theme: 'light', scale: 1 },
  { name: 'wash-review-phone', screen: 'laundry-review', width: 393, height: 852, theme: 'light', scale: 1 },
]
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--cases')) throw new Error('Usage: export-opendesign-reference.mjs [--cases matrix.json]')
const cases = args.length ? JSON.parse(await readFile(resolve(args[1]), 'utf8')) : defaultCases
if (!Array.isArray(cases) || !cases.length) throw new Error('Capture matrix must be a nonempty array.')
const names = new Set()
for (const example of cases) {
  if (typeof example.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(example.name) || names.has(example.name)) throw new Error('Case names must be unique filename-safe slugs.')
  names.add(example.name)
  if (typeof example.screen !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(example.screen) || !['light', 'dark'].includes(example.theme) || ![1, 2].includes(example.scale)) throw new Error(`Invalid screen/theme/text scale: ${example.name}`)
  if (![example.width, example.height].every((value) => Number.isInteger(value) && value >= 240 && value <= 2400)) throw new Error(`Invalid viewport: ${example.name}`)
  if (example.state !== undefined && !['invalid', 'error', 'busy'].includes(example.state)) throw new Error(`Invalid preview state: ${example.name}`)
  if (args.length && (typeof example.readySelector !== 'string' || !example.readySelector || typeof example.readyText !== 'string' || !example.readyText)) throw new Error(`Custom cases require readySelector and readyText: ${example.name}`)
}
await mkdir(join(output, 'source-reference'), { recursive: true })
// Invalidate an earlier receipt before overwriting any part of its bundle.
await writeFile(join(output, 'source-reference/receipt.json'), JSON.stringify({ status: 'capturing', baseline, sourceHashes }) + '\n')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const receipts = []
try {
  for (const example of cases) {
    // No profile, authentication state or owner records are copied into this context.
    const context = await browser.newContext({ viewport: { width: example.width, height: example.height }, colorScheme: example.theme, reducedMotion: 'reduce', locale: 'en-US', deviceScaleFactor: 1 })
    const page = await context.newPage()
    const observedAssets = new Map()
    page.on('response', (response) => {
      if (['image', 'font', 'stylesheet'].includes(response.request().resourceType()) && response.ok()) {
        observedAssets.set(response.url(), response.body().then((bytes) => ({ bytes, type: (response.headers()['content-type'] ?? 'application/octet-stream').split(';')[0] })))
      }
    })
    const url = new URL('/design-preview', base)
    url.search = new URLSearchParams({ screen: example.screen, textScale: String(example.scale) }).toString()
    if (example.state) url.searchParams.set('state', example.state)
    await page.goto(url.href)
    await page.locator(example.readySelector ?? 'h1').filter({ hasText: example.readyText ?? (example.screen === 'drying-home' ? /^Drying$/ : /wash|load/i) }).first().waitFor()
    // React's lazy route can paint before its additional styles have arrived.
    await page.waitForLoadState('networkidle')
    // TanStack replaces its SSR development stylesheet after hydration. Keeping
    // both copies changes Tailwind's cascade, even when their route looks ready.
    await page.locator('link[data-tanstack-router-dev-styles]').waitFor({ state: 'detached' })
    await page.evaluate(async (theme) => {
      document.documentElement.dataset.theme = theme
      await document.fonts.ready
      await Promise.all([...document.images].map(async (img) => { img.loading = 'eager'; await img.decode() }))
      // HTML cannot serialize scroll offsets introduced by a drawer's initial focus.
      // Compare both renderings at their top; interaction/focus checks use the live app.
      for (const node of document.querySelectorAll('*')) {
        if (node.scrollTop || node.scrollLeft) node.scrollTo(0, 0)
      }
      window.scrollTo(0, 0)
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    }, example.theme)
    const exported = await page.evaluate(() => {
      // Keep original compiled stylesheet text and ordering, including nesting.
      const sheets = [...document.styleSheets].filter((sheet) => !sheet.disabled).map((sheet) => ({
        base: sheet.href || location.href,
        href: sheet.href,
        text: sheet.ownerNode.tagName === 'STYLE' ? sheet.ownerNode.textContent : null,
        media: sheet.media.mediaText,
      }))
      const clone = document.documentElement.cloneNode(true)
      // Remove Vite/React scripts and runtime metadata. The reference never executes app operations.
      clone.querySelectorAll('script, style, link, base').forEach((node) => node.remove())
      const images = [...clone.querySelectorAll('img')].map((img) => {
        const original = [...document.images].find((candidate) => candidate.getAttribute('src') === img.getAttribute('src'))
        const source = original.currentSrc || original.src
        img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.loading = 'eager'
        img.src = source
        return source
      })
      return { html: '<!DOCTYPE html>\n' + clone.outerHTML, sheets, images: [...new Set(images)] }
    })
    const assets = new Map()
    async function inlineAsset(url) {
      if (url.startsWith('data:')) return url
      if (new URL(url).origin !== base.origin) throw new Error(`Unexpected external asset: ${url}`)
      if (!assets.has(url)) {
        const observed = await observedAssets.get(url)
        if (observed) {
          assets.set(url, `data:${observed.type};base64,${observed.bytes.toString('base64')}`)
          return assets.get(url)
        }
        const response = await context.request.get(url)
        if (!response.ok()) throw new Error(`Asset returned ${response.status()}: ${url}`)
        const bytes = await response.body()
        assets.set(url, `data:${response.headers()['content-type'].split(';')[0]};base64,${bytes.toString('base64')}`)
      }
      return assets.get(url)
    }
    let css = ''
    for (const sheet of exported.sheets) {
      let text = sheet.text
      if (text === null) {
        const observed = await observedAssets.get(sheet.href)
        if (!observed) throw new Error(`Stylesheet response was not captured: ${sheet.href}`)
        text = observed.bytes.toString('utf8')
      }
      for (const match of [...text.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/g)]) {
        const original = match[1] ?? match[2] ?? match[3].trim()
        if (original.startsWith('#')) continue
        text = text.replaceAll(match[0], `url("${await inlineAsset(new URL(original, sheet.base).href)}")`)
      }
      css += (sheet.media ? `@media ${sheet.media} {\n${text}\n}` : text) + '\n'
    }
    let html = exported.html
    for (const url of exported.images) html = html.replaceAll(url.replaceAll('&', '&amp;'), await inlineAsset(url))
    html = html.replace('</head>', `<style>${css.replaceAll('</style', '<\\/style')}</style></head>`)
    const path = join(output, 'source-reference', example.name + '.html')
    await writeFile(path, html)
    const selector = 'h1,h2,img,label,input,[role="alert"],[data-slot="button"],[data-slot="item-title"],[data-slot="item-description"],[data-slot="badge"]'
    const metrics = async (target) => target.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      return { text: node.textContent, x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: style.fontFamily, size: style.fontSize, weight: style.fontWeight, leading: style.lineHeight, display: style.display, padding: style.padding, radius: style.borderRadius, color: style.color, background: style.backgroundColor, objectFit: style.objectFit, objectPosition: style.objectPosition }
    }))
    const sourceMetrics = await metrics(page)
    const sourcePixels = await page.screenshot({ animations: 'disabled' })
    await writeFile(join(output, 'source-reference', example.name + '.source.png'), sourcePixels)
    const reference = await context.newPage()
    await reference.goto(new URL('file://' + path).href)
    await reference.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((img) => img.decode())) })
    const referenceMetrics = await metrics(reference)
    const referencePixels = await reference.screenshot({ animations: 'disabled' })
    const geometryMatches = JSON.stringify(sourceMetrics) === JSON.stringify(referenceMetrics)
    const pixelComparison = await reference.evaluate(async ([source, reference, width]) => {
      async function pixels(encoded) {
        const img = new Image(); img.src = 'data:image/png;base64,' + encoded; await img.decode()
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, img.width, img.height).data
      }
      const a = await pixels(source), b = await pixels(reference)
      const images = [...document.images].map((img) => img.getBoundingClientRect())
      let changed = 0, outsideImages = 0
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
        changed++
        const x = (i / 4) % width, y = Math.floor(i / 4 / width)
        // Include the one-pixel antialias fringe around fractional image bounds.
        if (!images.some((rect) => x >= Math.floor(rect.left) - 1 && x <= Math.ceil(rect.right) && y >= Math.floor(rect.top) - 1 && y <= Math.ceil(rect.bottom))) outsideImages++
      }
      return { changed, outsideImages }
    }, [sourcePixels.toString('base64'), referencePixels.toString('base64'), example.width])
    const pixelsMatch = pixelComparison.changed === 0
    await writeFile(join(output, 'source-reference', example.name + '.png'), referencePixels)
    receipts.push({ ...example, url: url.href, htmlSha256: hash(html), checkedElements: sourceMetrics.length, geometryMatches, pixelsMatch, pixelComparison, sourceScreenshotSha256: hash(sourcePixels), referenceScreenshotSha256: hash(referencePixels) })
    await writeFile(join(output, 'source-reference', example.name + '.metrics.json'), JSON.stringify({ source: sourceMetrics, reference: referenceMetrics }, null, 2) + '\n')
    // Original photo bytes are preserved; Chrome may rasterize data-URL photos
    // differently. Never excuse differences in text, controls or surrounding layout.
    if (!geometryMatches || pixelComparison.outsideImages > 0) throw new Error(`Source/reference mismatch: ${example.name} (${JSON.stringify(pixelComparison)}); inspect metrics and screenshots before importing.`)
    console.log(`${example.name}: ${sourceMetrics.length} element metrics match; ${pixelComparison.outsideImages} changed pixels outside photos (${pixelComparison.changed} within photos)`)
    await context.close()
  }
} finally { await browser.close() }
// Fail if source changed during capture; don't stamp a mixed revision as verified.
if (JSON.stringify(await referenceInputHashes(webRoot)) !== JSON.stringify(sourceHashes)) throw new Error('Source inputs changed during export; regenerate a consistent bundle.')
const receipt = { version: 2, status: 'verified', generatedAt: new Date().toISOString(), baseline, sourceHashes, cases: receipts, scope: 'Synthetic, static React rendering reference, with scroll positions normalized to the top. No app operations or household data. Canonical design reconciliation is separate.' }
await writeFile(join(output, 'source-reference/receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
await writeFile(join(output, 'source-render-reference.html'), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Current React rendering — A Laundered Closet</title><style>body{margin:0;padding:24px;background:#f7f5ee;color:#20211e;font:16px/1.5 system-ui}main{max-width:1200px;margin:auto}h1{font-size:28px}p{max-width:75ch}section{margin:32px 0}.reference-viewport{max-width:100%;overflow:auto}iframe{display:block;border:1px solid #ccc;max-width:none}a{color:#164be0}code{overflow-wrap:anywhere}</style></head><body><main><h1>Current React rendering</h1><p>This reference uses the actual app DOM, compiled Tailwind CSS and embedded assets. It preserves the shipped fonts. These are static examples: buttons show their current geometry but do not execute actions. Use the live app for interaction testing. OpenDesign’s typography and UX proposals are separate. Reference frames keep their stated content width; scroll horizontally when your viewing panel is narrower.</p><p>Source checkpoint: <code>${baseline}</code>. <a href="source-reference/receipt.json">Rendering verification</a></p>${cases.map((example) => `<section><h2>${example.name} · ${example.width} × ${example.height} · ${example.scale}× text${example.state ? ` · ${example.state}` : ''}</h2><p><a href="source-reference/${example.name}.html">Open reference at full size</a> · <a href="${base.origin}/design-preview?screen=${example.screen}&amp;textScale=${example.scale}${example.state ? `&amp;state=${example.state}` : ''}">Test live React screen</a></p><div class="reference-viewport"><iframe title="${example.name} static source reference" src="source-reference/${example.name}.html" width="${example.width}" height="${example.height}" sandbox="allow-same-origin"></iframe></div></section>`).join('')}</main></body></html>`)
console.log(`Verified portable reference: ${output}`)
