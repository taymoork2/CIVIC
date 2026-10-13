import type { DesignExport, DesignFrame } from '../../graph/src/index.ts'
import { contentHash } from './fragment.ts'

/**
 * One case in a source-render receipt: a screen of the app rendered at one viewport, theme
 * and text scale, with the hash of the reference image designers review proposals beside.
 */
interface RenderCase {
  name: string
  screen: string
  state?: string
  width: number
  height: number
  theme: string
  scale: number
  htmlSha256: string
  referenceScreenshotSha256: string
  geometryMatches: boolean
}

/**
 * The receipt of a source-render reference (Open Design's `source-reference/receipt.json`):
 * the cases a design system renders from the app's own components, so a proposal is
 * reviewed beside what the code draws today.
 */
export interface RenderReceipt {
  version: number
  status: string
  generatedAt: string
  /** The app commit the cases were rendered at. */
  baseline: string
  cases: RenderCase[]
}

export interface RenderReferenceOptions {
  /** The design tool the reference lives in, such as `open-design`. */
  tool: string
  /** The design file's key in that tool. */
  key: string
  name: string
  /** Where the receipt can be read. */
  link?: string
  /** The graph targets a screen of the reference designs. Unknown screens design none. */
  designs: (screen: string, state: string | undefined) => string[]
}

/**
 * Reads a source-render receipt as a design file (`civic.design/0`): one frame per case,
 * on a page per screen, fingerprinted by the reference image and the render settings, so a
 * new reference of the same case shows as a changed frame. Its version is the time the
 * receipt was generated. Deterministic, with no model calls.
 */
export function readRenderReceipt(receipt: RenderReceipt, options: RenderReferenceOptions): DesignExport {
  if (typeof receipt?.generatedAt !== 'string' || !Array.isArray(receipt.cases)) {
    throw new Error('That is not a source-render receipt: it needs generatedAt and cases.')
  }
  if (receipt.status !== 'verified') throw new Error(`The receipt is ${receipt.status}, not verified, so its frames can't stand for the reference.`)
  const seen = new Set<string>()
  const frames = receipt.cases.map((item): DesignFrame => {
    if (seen.has(item.name)) throw new Error(`The receipt names case ${item.name} twice.`)
    seen.add(item.name)
    const settings = { screen: item.screen, state: item.state ?? null, width: item.width, height: item.height, theme: item.theme, scale: item.scale }
    return {
      node: item.name,
      name: `${item.screen}${item.state ? ` (${item.state})` : ''} · ${item.width}×${item.height} ${item.theme}${item.scale === 1 ? '' : ` · text ×${item.scale}`}`,
      page: item.screen,
      hash: contentHash(JSON.stringify({ ...settings, reference: item.referenceScreenshotSha256 })),
      designs: options.designs(item.screen, item.state),
    }
  })
  return {
    schema: 'civic.design/0',
    tool: options.tool,
    key: options.key,
    name: options.name,
    version: receipt.generatedAt,
    ...(options.link ? { link: options.link } : {}),
    frames,
  }
}
