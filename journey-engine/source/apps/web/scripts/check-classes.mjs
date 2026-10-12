#!/usr/bin/env node
// Compile static utilities in component class expressions, including colocated cn/cva lists.
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { __unstable__loadDesignSystem } from '@tailwindcss/node'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = join(webRoot, 'src')
const css = await readFile(join(srcRoot, 'app.css'), 'utf8')
if (!css.includes("@source './';")) throw new Error('Tailwind must scan every app component.')
const designSystem = await __unstable__loadDesignSystem(css, { base: srcRoot })

async function files(dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'test') result.push(...await files(path))
    else if (/\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name)) result.push(path)
  }
  return result
}

// Only read strings in class expressions; never evaluate application code.
function classStrings(source) {
  const values = [...source.matchAll(/className="([^"]*)"/g)].map(match => match[1])
  for (const match of source.matchAll(/\b(?:cn|cva)\(/g)) {
    let depth = 1, quote = '', start = match.index + match[0].length
    for (let i = start; i < source.length && depth; i++) {
      const char = source[i]
      if (quote) {
        if (char === '\\') { i++; continue }
        if (char === quote) {
          const raw = source.slice(start, i)
          if (/\\["'\\]/.test(raw) && /[:\[]/.test(raw)) throw new Error(`Use literal selector text so Tailwind's scanner and JavaScript agree: ${raw}`)
          if (quote !== '`' || !raw.includes('${')) values.push(raw.replace(/\\(["'\\])/g, '$1'))
          quote = ''
        }
      } else if (char === '/' && source[i + 1] === '/') {
        const end = source.indexOf('\n', i + 2)
        i = end === -1 ? source.length : end
      } else if (char === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2)
        if (end === -1) throw new Error('Unclosed comment in class expression')
        i = end + 1
      } else if (char === '"' || char === "'" || char === '`') { quote = char; start = i + 1 }
      else if (char === '(') depth++
      else if (char === ')') depth--
    }
  }
  return values
}

const candidates = new Map()
for (const file of await files(srcRoot)) {
  for (const token of classStrings(await readFile(file, 'utf8')).flatMap(value => value.split(/\s+/)).filter(Boolean)) {
    if (!candidates.has(token)) candidates.set(token, file)
  }
}
const names = [...candidates.keys()]
const built = designSystem.candidatesToCss(names)
const missing = names.filter((token, index) => built[index] === null && /[:\[\]]|^rounded-0$/.test(token))
if (missing.length) {
  for (const token of missing) console.error(`${relative(webRoot, candidates.get(token))}: ${token}`)
  process.exitCode = 1
} else console.log(`check-classes: ${built.filter(Boolean).length} static utilities compile across the app.`)
