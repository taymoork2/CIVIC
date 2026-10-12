#!/usr/bin/env node
// Prevent a second component styling system from reappearing beside Tailwind.
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = join(dirname(fileURLToPath(import.meta.url)), '../src')
const css = await readFile(join(src, 'app.css'), 'utf8')
if (/(?:^|\n)\s*\.[a-z_-]/i.test(css)) throw new Error('Component selectors belong in Tailwind class expressions.')
const styles = (await readdir(src)).filter(file => file.endsWith('.css') && file !== 'app.css')
if (styles.length) throw new Error(`Unexpected component stylesheet: ${styles.join(', ')}`)
console.log('class-collision: app.css contains only document, theme, and browser animation rules.')
