import type { CollaborationRecord, Evidence, Owner, Platform, Role, SourceRef, Target } from '../../graph/src/index.ts'
import { contentHash, fragment, slug, type Fragment } from './fragment.ts'
import { scenarioTarget } from './journey.ts'

/** One expectation in the journey engine's coverage contract (`coverage.json`). */
interface CoverageExpectation {
  id: string
  title: string
  kind: 'journey' | 'screen' | 'interaction'
  /** Where the code is, when it exists: `path#Export`. */
  component?: string
  scenarios: string[]
  acceptance?: string[]
}

/** The journey engine's coverage contract: what the project declares must be shown and proven. */
export interface CoverageContract {
  version: number
  targets: CoverageExpectation[]
}

export interface CoverageContractOptions {
  /** The same ID segment the journey index used, so expected scenarios meet their targets. */
  prefix: string
  platform: Platform
  owners: Owner[]
  /** Who the contract speaks for: the person or team who declared the expectations. */
  raisedBy: Owner
  /** When the gaps were seen: the capture the evidence comes from, so the output is deterministic. */
  at: string
  /** Where the contract was read from, and the revision it was read at. */
  path: string
  revision: string
  /** The scenario targets the journey index produced, and the evidence about them. */
  targetIds: ReadonlySet<string>
  evidence: readonly Evidence[]
}

const SCALE: Record<CoverageExpectation['kind'], Target['scale']> = { journey: 'journey', screen: 'screen', interaction: 'surface' }

/** The target an expectation becomes. Its scenarios keep their own targets from the journey index. */
export const expectationTarget = (prefix: string, id: string) => `target:${prefix}.expectation.${id}`

/**
 * Reads the journey engine's coverage contract (roadmap step 3) into the graph. Each
 * expectation becomes an expected target. An expectation the project can't yet show and
 * prove becomes an open Coverage gap record: no scenario shows it, a scenario it expects
 * isn't in the review index, or no passing run covers one of its scenarios. A gap names its
 * expectation and the scenarios still unproven, and needs a person to close it; the next
 * import stops raising it once a passing run covers every scenario. File presence and
 * generated scaffolds never count as coverage. No model calls (D30).
 */
export function readCoverageContract(contract: CoverageContract, text: string, options: CoverageContractOptions): Fragment {
  if (!contract || !Array.isArray(contract.targets)) throw new Error('Not a journey engine coverage contract: it needs `targets`.')
  const { prefix, platform, owners, raisedBy, at, targetIds } = options
  const source = (anchor: string): SourceRef => ({ tool: 'journey-engine', importer: 'coverage-contract', revision: options.revision, path: options.path, anchor, contentHash: contentHash(text) })
  const passing = new Set(options.evidence.filter((item) => item.outcome === 'pass').flatMap((item) => item.subjectIds))

  const targets: Target[] = []
  const gaps: CollaborationRecord[] = []
  for (const expectation of contract.targets) {
    const id = expectationTarget(prefix, expectation.id)
    targets.push({ id, kind: 'target', title: expectation.title, scale: SCALE[expectation.kind] ?? 'surface', presence: 'expected', platforms: [platform], owners, source: source(expectation.id) })

    const missing = expectation.scenarios.filter((scenario) => !targetIds.has(scenarioTarget(prefix, scenario)))
    const unproven = expectation.scenarios.filter((scenario) => targetIds.has(scenarioTarget(prefix, scenario)) && !passing.has(scenarioTarget(prefix, scenario)))
    const problems: string[] = []
    let perspectives: Role[] = ['qa']
    if (expectation.scenarios.length === 0) {
      problems.push(expectation.component
        ? `\`${expectation.component}\` exists, but no scenario shows it, so no run can prove it.`
        : 'Declared, but nothing shows it yet: no scenario and no code.')
      perspectives = ['engineering', 'qa']
    }
    if (missing.length > 0) problems.push(`Expected scenario${missing.length === 1 ? '' : 's'} not in the review index: ${missing.map((item) => `\`${item}\``).join(', ')}.`)
    if (unproven.length > 0) problems.push(`No passing run covers ${unproven.map((item) => `\`${item}\``).join(', ')}.`)
    if (problems.length === 0) continue

    gaps.push({
      id: `collab:coverage-gap.${prefix}.${slug(expectation.id)}`,
      kind: 'collaboration',
      title: `Coverage gap: ${expectation.title}`,
      type: 'coverage-gap',
      subjectIds: [id, ...unproven.map((scenario) => scenarioTarget(prefix, scenario))],
      platform,
      summary: problems.join(' '),
      perspectives,
      owners,
      raisedBy,
      at,
      status: 'open',
      source: source(expectation.id),
    })
  }
  return fragment([...targets, ...gaps])
}
