import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkGraph, evidenceAge, freshnessRoot, indexGraph, screenFacts, staleEvidence, type GraphDocument } from '../src/index.ts'

// Roadmap step 6: evidence becomes visibly stale when the code it proves changes.

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'civic-fresh-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.email', 'qa@example.com')
  git('config', 'user.name', 'QA')
  mkdirSync(join(root, 'app'))
  mkdirSync(join(root, 'docs'))
  const commit = (path: string, text: string) => {
    writeFileSync(join(root, path), text)
    git('add', '-A')
    git('commit', '-qm', path)
    return git('rev-parse', 'HEAD')
  }
  return { root, commit, done: () => rmSync(root, { recursive: true, force: true }) }
}

const owners = [{ role: 'qa' as const, who: 'qa' }]
const graphAt = (revision: string): GraphDocument => ({
  schema: 'civic.graph/0',
  records: [
    { id: 'target:app.form', kind: 'target', title: 'Form', scale: 'screen', presence: 'expected', owners },
    { id: 'evidence:playwright.saves', kind: 'evidence', title: 'saves', subjectIds: ['target:app.form'], tier: 'automated', method: 'playwright', outcome: 'pass', capturedAt: '2026-10-12T00:00:00Z', source: { tool: 'playwright', importer: 'playwright-report', revision } },
    { id: 'evidence:github.source', kind: 'evidence', title: 'reads the form source', subjectIds: ['target:app.form'], tier: 'static-analysis', method: 'source-analysis', outcome: 'finding', finding: 'ok', capturedAt: '2026-10-12T00:00:00Z', source: { tool: 'github', importer: 'source', revision: 'v1.2.3' } },
  ],
  links: [],
})
const rule = { graph: 'app.graph.json', tools: ['playwright'], watch: ['app'] }

test('evidence is fresh until the code it proves changes, and other changes leave it alone', () => {
  const repo = repository()
  try {
    const captured = repo.commit('app/form.ts', 'export const form = 1\n')
    assert.deepEqual([...staleEvidence(graphAt(captured), rule, repo.root)], [])
    repo.commit('docs/notes.md', 'unrelated\n')
    assert.deepEqual([...staleEvidence(graphAt(captured), rule, repo.root)], [], 'a change outside the watched code')
    repo.commit('app/form.ts', 'export const form = 2\n')
    const stale = staleEvidence(graphAt(captured), rule, repo.root)
    assert.deepEqual([...stale.keys()], ['evidence:playwright.saves'], 'only the tools the rule names')
    assert.match(stale.get('evidence:playwright.saves')!, /^1 file under app changed since [0-9a-f]{12}$/)
    // An uncommitted edit shows at once.
    const head = repo.commit('app/other.ts', 'x\n')
    writeFileSync(join(repo.root, 'app/other.ts'), 'y\n')
    assert.equal(staleEvidence(graphAt(head), rule, repo.root).size, 1)
    assert.match(staleEvidence(graphAt('0123456789abcdef'), rule, repo.root).get('evidence:playwright.saves')!, /isn't in this repository/)
  } finally {
    repo.done()
  }
})

test('the gate reports stale evidence as advisory with a count, and the screen shows it', () => {
  const graph = indexGraph(graphAt('abc123def4567'))
  const stale = new Map([['evidence:playwright.saves', '1 file under app changed since abc123def456']])
  const check = checkGraph('app.graph.json', graph, { today: '2026-10-12', stale })
  assert.deepEqual(check.findings.map((item) => [item.kind, item.subjectId]), [['stale-evidence', 'evidence:playwright.saves']])
  assert.match(check.findings[0]!.summary, /saves is stale: 1 file under app changed since abc123def456\. Recapture it\./)
  assert.deepEqual(check.measures.find((item) => item.check === 'Evidence stale'), { graph: 'app.graph.json', check: 'Evidence stale', found: 1, of: 2 })
  // Without a freshness rule, staleness isn't checked or measured.
  assert.equal(checkGraph('app.graph.json', graph, { today: '2026-10-12' }).measures.some((item) => item.check === 'Evidence stale'), false)
  const facts = screenFacts(graph, 'app.graph.json', 'target:app.form', { today: '2026-10-12', stale })
  assert.deepEqual(facts.findings.map((item) => [item.kind, item.blocks]), [['stale-evidence', false]], 'advisory, so it never blocks')
  assert.deepEqual(facts.evidence.map((item) => [item.title, item.stale]), [['saves', '1 file under app changed since abc123def456'], ['reads the form source', undefined]])
})

test('code in another repository is compared in the checkout a variable names, and otherwise only aged', () => {
  const app = repository()
  try {
    const captured = app.commit('app/form.ts', 'export const form = 1\n')
    const elsewhere = { ...rule, checkout: { repository: 'acme/app', env: 'APP_CHECKOUT' } }
    // Without the variable there is nothing to compare with, so nothing is stale.
    assert.equal(freshnessRoot(elsewhere, '/civic', {}), undefined)
    assert.equal(freshnessRoot(rule, '/civic', {}), '/civic', 'a rule without a checkout reads this repository')
    const root = freshnessRoot(elsewhere, '/civic', { APP_CHECKOUT: app.root })!
    assert.equal(root, app.root)
    assert.deepEqual([...staleEvidence(graphAt(captured), elsewhere, root)], [])
    app.commit('app/form.ts', 'export const form = 2\n')
    assert.deepEqual([...staleEvidence(graphAt(captured), elsewhere, root).keys()], ['evidence:playwright.saves'])
    assert.deepEqual(evidenceAge(graphAt(captured), elsewhere), { capturedAt: '2026-10-12T00:00:00Z', revision: captured, count: 1 })
  } finally {
    app.done()
  }
})
