import type { Evidence, Platform } from '../../graph/src/index.ts'
import { slug } from './fragment.ts'

interface ReportTest {
  annotations?: { type: string; description?: string }[]
  results: { status: string; startTime: string; errors?: { message?: string }[] }[]
}
interface ReportSpec {
  title: string
  file: string
  line: number
  tests: ReportTest[]
}
interface ReportSuite {
  specs?: ReportSpec[]
  suites?: ReportSuite[]
}

/**
 * Reads a Playwright JSON report (the built-in `json` reporter, D27). Each test that names
 * CIVIC records in a `civic.subject` annotation becomes one automated evidence record, tied
 * to the revision in the report's `civic.revision` metadata. Tests without that annotation
 * are not CIVIC evidence and are left out. A skipped test proves nothing and is left out;
 * anything that did not pass is a fail, never a pass.
 */
export function readPlaywrightReport(report: unknown, platform: Platform): Evidence[] {
  const root = report as { config?: { metadata?: Record<string, unknown> }; suites?: ReportSuite[] }
  const revision = root.config?.metadata?.['civic.revision']
  if (typeof revision !== 'string') throw new Error('The Playwright report has no `civic.revision` metadata, so its results cannot be tied to a revision.')
  const evidence: Evidence[] = []
  const walk = (suite: ReportSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const subjectIds = (test.annotations ?? []).filter((note) => note.type === 'civic.subject' && note.description).map((note) => note.description!)
        const result = test.results.at(-1)
        if (subjectIds.length === 0 || !result || result.status === 'skipped') continue
        const passed = result.status === 'passed'
        evidence.push({
          id: `evidence:playwright.${slug(spec.title)}`,
          kind: 'evidence',
          title: spec.title,
          subjectIds,
          tier: 'automated',
          method: 'playwright',
          platform,
          outcome: passed ? 'pass' : 'fail',
          ...(passed ? {} : { finding: result.errors?.[0]?.message?.split('\n')[0] ?? `Test ${result.status}.` }),
          capturedAt: result.startTime,
          source: { tool: 'playwright', importer: 'playwright-report', revision, path: spec.file, anchor: `line ${spec.line}` },
        })
      }
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of root.suites ?? []) walk(suite)
  const ids = evidence.map((item) => item.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate) throw new Error(`Two Playwright tests map to ${duplicate}; give them distinct titles.`)
  return evidence
}
