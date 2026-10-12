import { RUN_METHODS, type Evidence, type EvidenceMethod, type Platform } from '../../graph/src/index.ts'
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

/** How to read a suite whose tests carry no `civic.subject` annotations. */
export interface PlaywrightReportOptions {
  subjectsFor?: (spec: { file: string; title: string; line: number }) => string[]
  pathFor?: (file: string) => string
}

/**
 * Reads a Playwright JSON report (the built-in `json` reporter, D27). Each test that names
 * CIVIC records in a `civic.subject` annotation becomes one automated evidence record, tied
 * to the revision in the report's `civic.revision` metadata. Tests without that annotation
 * are not CIVIC evidence and are left out. A skipped test proves nothing and is left out;
 * anything that did not pass is a fail, never a pass.
 *
 * A test can say how it observed its subject with a `civic.method` annotation, such as
 * `storybook` for a test that opens a Storybook story, and where with `civic.source`
 * (`<path>#<anchor>`, such as the story file and story ID). Without them the evidence is
 * `playwright`, sourced at the test's own file and line.
 *
 * A suite that predates CIVIC carries no annotations. For it, `subjectsFor` names a test's
 * subjects from the project's own declared mapping (such as the journey engine's checks
 * per scenario), and `pathFor` gives the test file's repository path. A `civic.subject`
 * annotation still wins over both.
 */
export function readPlaywrightReport(report: unknown, platform: Platform, options: PlaywrightReportOptions = {}): Evidence[] {
  const root = report as { config?: { metadata?: Record<string, unknown> }; suites?: ReportSuite[] }
  const revision = root.config?.metadata?.['civic.revision']
  if (typeof revision !== 'string') throw new Error('The Playwright report has no `civic.revision` metadata, so its results cannot be tied to a revision.')
  const evidence: Evidence[] = []
  const walk = (suite: ReportSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const annotated = (test.annotations ?? []).filter((note) => note.type === 'civic.subject' && note.description).map((note) => note.description!)
        const subjectIds = annotated.length > 0 ? annotated : (options.subjectsFor?.(spec) ?? [])
        const result = test.results.at(-1)
        if (subjectIds.length === 0 || !result || result.status === 'skipped') continue
        const passed = result.status === 'passed'
        const note = (type: string) => test.annotations?.find((candidate) => candidate.type === type)?.description
        const method = note('civic.method') ?? 'playwright'
        if (!(RUN_METHODS as readonly string[]).includes(method)) throw new Error(`${spec.title}: civic.method ${method} is not a run method (${RUN_METHODS.join(', ')}).`)
        const [path, anchor] = note('civic.source')?.split('#') ?? [options.pathFor?.(spec.file) ?? spec.file, `line ${spec.line}`]
        evidence.push({
          id: `evidence:${method}.${slug(spec.title)}`,
          kind: 'evidence',
          title: spec.title,
          subjectIds,
          tier: 'automated',
          method: method as EvidenceMethod,
          platform,
          outcome: passed ? 'pass' : 'fail',
          ...(passed ? {} : { finding: result.errors?.[0]?.message?.split('\n')[0] ?? `Test ${result.status}.` }),
          capturedAt: result.startTime,
          source: { tool: 'playwright', importer: 'playwright-report', revision, ...(path ? { path } : {}), ...(anchor ? { anchor } : {}) },
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
