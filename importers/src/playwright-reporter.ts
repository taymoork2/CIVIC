import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { renderCoverage, runCoverage, type Evidence, type GraphDocument, type Platform, type RunCoverage } from '../../graph/src/index.ts'
import { readPlaywrightReport, type PlaywrightReportOptions } from './playwright.ts'

// The QA side of roadmap step 10: a Playwright reporter that turns a run into CIVIC
// evidence where the run happens, and says at the end of the run what it covered compared
// with the graph: what now fails that passed, what now passes, and what it left uncovered.
// Add it beside the reporters a suite already uses; it changes no test.
//
//   reporter: [['list'], ['<repo>/importers/src/playwright-reporter.ts', { graph: 'out/graph.json', platform: 'web', output: 'civic-run.json' }]]
//
// Tests name their CIVIC subjects with `civic.subject` annotations, as for
// readPlaywrightReport, or the options' `subjectsFor` names them from a project's own
// mapping. No model calls (D30).

export interface CivicReporterOptions extends PlaywrightReportOptions {
  /** The CIVIC graph the run is compared with, relative to the config file. Without it the reporter only writes evidence. */
  graph?: string
  platform?: Platform
  /** Where to write the run (`civic.run/0`), relative to the config file: its evidence records and the coverage. */
  output?: string
  /** The revision the run proves. Defaults to the config's `civic.revision` metadata, then the git commit. */
  revision?: string
  /** Narrows the subjects the run is expected to cover. */
  scope?: (id: string) => boolean
}

/** What the reporter writes: evidence a project build can assemble into its graph. */
export interface CivicRun {
  schema: 'civic.run/0'
  revision: string
  platform: Platform
  evidence: Evidence[]
  coverage?: RunCoverage
}

// The parts of Playwright's reporter API this reads, typed structurally so the importers
// package needs no Playwright dependency.
interface Config {
  /** The test directory: report paths are relative to it, as in Playwright's JSON report. */
  rootDir: string
  /** The config file: the options' paths are relative to its directory. */
  configFile?: string
  metadata?: Record<string, unknown>
}
interface TestCase {
  id: string
  title: string
  location: { file: string; line: number }
  annotations: { type: string; description?: string }[]
}
interface TestResult {
  status: string
  startTime: Date
  errors: { message?: string }[]
}

export default class CivicReporter {
  private readonly options: CivicReporterOptions
  private rootDir = process.cwd()
  private configDir = process.cwd()
  private metadata: Record<string, unknown> = {}
  private readonly results = new Map<string, { test: TestCase; result: TestResult }>()
  /** The last run's result, for tests and callers that use the reporter as a library. */
  run?: CivicRun

  constructor(options: CivicReporterOptions = {}) {
    this.options = options
  }

  printsToStdio(): boolean {
    return false
  }

  onBegin(config: Config): void {
    this.rootDir = config.rootDir
    this.configDir = config.configFile ? dirname(config.configFile) : config.rootDir
    this.metadata = config.metadata ?? {}
  }

  /** Keeps each test's last attempt, so a retry that passed counts as the result. */
  onTestEnd(test: TestCase, result: TestResult): void {
    this.results.set(test.id, { test, result })
  }

  onEnd(): void {
    const platform = this.options.platform ?? 'web'
    const revision = this.options.revision ?? (typeof this.metadata['civic.revision'] === 'string' ? (this.metadata['civic.revision'] as string) : gitRevision(this.rootDir))
    const files = new Map<string, { title: string; file: string; line: number; tests: { annotations: TestCase['annotations']; results: { status: string; startTime: string; errors: { message?: string }[] }[] }[] }[]>()
    for (const { test, result } of this.results.values()) {
      const file = relative(this.rootDir, test.location.file)
      const specs = files.get(file) ?? []
      specs.push({ title: test.title, file, line: test.location.line, tests: [{ annotations: test.annotations, results: [{ status: result.status, startTime: result.startTime.toISOString(), errors: result.errors.map((error) => ({ message: error.message })) }] }] })
      files.set(file, specs)
    }
    // The same shape as Playwright's JSON report, so one importer reads both.
    const report = { config: { metadata: { ...this.metadata, 'civic.revision': revision } }, suites: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, specs]) => ({ file, specs })) }
    const evidence = readPlaywrightReport(report, platform, this.options)
    let coverage: RunCoverage | undefined
    if (this.options.graph) {
      const graphPath = resolve(this.configDir, this.options.graph)
      coverage = runCoverage(JSON.parse(readFileSync(graphPath, 'utf8')) as GraphDocument, evidence, platform, this.options.scope)
      console.log(`\n${renderCoverage(coverage, this.options.graph)}`)
    }
    this.run = { schema: 'civic.run/0', revision, platform, evidence, ...(coverage ? { coverage } : {}) }
    if (this.options.output) {
      const output = resolve(this.configDir, this.options.output)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, `${JSON.stringify(this.run, null, 2)}\n`)
      console.log(`CIVIC: wrote ${evidence.length} evidence record(s) to ${this.options.output}.`)
    }
  }
}

/** Reads a run the reporter wrote, for a project build to assemble into its graph. */
export function readCivicRun(run: unknown): Evidence[] {
  const value = run as Partial<CivicRun>
  if (value?.schema !== 'civic.run/0' || !Array.isArray(value.evidence)) throw new Error('Not a CIVIC run file (civic.run/0).')
  return value.evidence
}

/**
 * The commit the run proves. A dirty tree is marked, so the evidence never claims a commit
 * that doesn't hold the code it ran, and the freshness check reads it as stale.
 */
function gitRevision(root: string): string {
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    const sha = git('rev-parse', 'HEAD')
    return git('status', '--porcelain') === '' ? sha : `${sha}+uncommitted`
  } catch {
    throw new Error('The CIVIC reporter needs a revision: pass `revision`, set `civic.revision` metadata, or run inside a git checkout.')
  }
}
