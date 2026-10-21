import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

/** Resolve a preview's pinned packages without replacing the shell's own dependencies. */
export function previewDependencies(aliases, source) {
  return {
    name: 'civic-preview-dependencies', enforce: 'pre',
    async resolveId(id, importer) {
      if (!importer?.startsWith(source + '/')) return
      const name = Object.keys(aliases).find(name => id === name || id.startsWith(name + '/'))
      if (name) return this.resolve(id, join(aliases[name], 'package.json'), { skipSelf: true })
    },
  }
}

export function checkDependencyLock(expected, installed) {
  // pnpm's version-9 package blocks are content/peer-version pins; extra installed packages are fine.
  if (![expected, installed].every(text => /^lockfileVersion: ['"]?9\.0['"]?$/m.test(text))) throw Error('Unsupported preview dependency lock format')
  for (const section of ['packages', 'snapshots']) {
    const blocks = text => {
      const body = text.split(`\n${section}:\n`)[1]?.split(/\n[^\s]/)[0]
      if (!body) throw Error(`Missing ${section} dependency pins`)
      return new Map(body.split(/\n(?=  \S)/).filter(block => block.trim()).map(block => [block.split('\n')[0].trim(), block.trim()]))
    }
    const available = blocks(installed)
    for (const [key, value] of blocks(expected)) if (available.get(key) !== value) throw Error(`Install the worktree's pinned dependencies separately before connecting it: ${key}`)
  }
}

/** Resolve matching installed packages without creating node_modules in a source checkout. */
export async function dependencyAliases(source, installed, parts) {
  checkDependencyLock(await readFile(join(source, 'pnpm-lock.yaml'), 'utf8'), await readFile(join(installed, 'pnpm-lock.yaml'), 'utf8'))
  const aliases = {}
  for (const part of parts) {
    const expected = JSON.parse(await readFile(join(source, part, 'package.json'), 'utf8'))
    const available = JSON.parse(await readFile(join(installed, part, 'package.json'), 'utf8'))
    for (const [name, version] of Object.entries(expected.dependencies ?? {})) {
      if (version.startsWith('workspace:')) continue
      if (available.dependencies?.[name] !== version) throw Error(`Preview dependency differs: ${name} ${version}. Install compatible dependencies separately.`)
      const path = await realpath(join(installed, part, 'node_modules', name))
      if (aliases[name] && aliases[name] !== path) throw Error(`Preview dependency has conflicting installations: ${name}`)
      aliases[name] = path
    }
  }
  return aliases
}
