import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'style', 'build', 'ci', 'chore', 'revert']
const TYPED = new RegExp(`^(?:${TYPES.join('|')})(?:\\([a-z0-9-]+\\))?!?: \\S`, 'u')
// Git writes these titles itself.
const GENERATED = /^(?:Merge |Revert "|fixup! |squash! |amend! )/u
const titleOf = (message: string) => message.split('\n').find(line => line.trim() !== '' && !line.startsWith('#')) ?? ''
export const typed = (message: string) => GENERATED.test(titleOf(message)) || TYPED.test(titleOf(message))
export const untyped = (root: string, base = 'main') => execFileSync('git', ['-C', root, 'log', '--format=%s', `${base}..HEAD`], { encoding: 'utf8' }).split('\n').filter(title => title !== '' && !typed(title))
export const advice = (titles: readonly string[]) => `Start each commit title with a type, like "fix: Keep the reason plain" (${TYPES.join(', ')}):\n${titles.map(title => `  ${title}`).join('\n')}`

if (import.meta.main) {
  const [file] = process.argv.slice(2)
  const bad = file === undefined ? untyped(fileURLToPath(new URL('..', import.meta.url))) : [readFileSync(file, 'utf8')].flatMap(message => typed(message) ? [] : [titleOf(message)])
  if (bad.length > 0) {
    console.error(advice(bad))
    process.exitCode = 1
  }
}
