// Rasterize the editable SVG with the project's existing browser renderer.
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const source = await readFile(new URL('../public/icons/laundered-closet.svg', import.meta.url), 'utf8')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const [file, size] of [['laundered-closet-192.png', 192], ['laundered-closet-512.png', 512], ['laundered-closet-maskable-512.png', 512], ['laundered-closet-apple-touch.png', 180]]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${source}`)
    await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname })
  }
} finally {
  await browser.close()
}
