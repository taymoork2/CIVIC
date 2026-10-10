import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileOwnerProductEvidence, ownerProductEvidenceCompilerVersion } from '../src/owner-product-evidence.ts'

// Offline compiler, not an ingester. Both output files are exclusive-create.
// node --experimental-strip-types packages/planner/scripts/compile-owner-product-evidence.ts \
//   docs/research/owner-product-integration/input docs/research/owner-product-integration/output
const args = process.argv.slice(2)
if ((args.length !== 2 && args.length !== 4) || args.slice(0, 2).some((arg) => arg.startsWith('-')) || (args.length === 4 && (args[2] !== '--previous' || args[3]!.startsWith('-')))) {
  throw new Error('Usage: compile-owner-product-evidence.ts <input-json-or-directory> <output-directory> [--previous <manifest.json>]')
}
const inputPath = await realpath(resolve(args[0]!))
const inputStat = await stat(inputPath)
if (!inputStat.isFile() && !inputStat.isDirectory()) throw new Error('Input must be a JSON file or evidence directory')
const singleFile = inputStat.isFile()
if (singleFile && !inputPath.endsWith('.json')) throw new Error('Input file must be JSON')
const inputDir = singleFile ? dirname(inputPath) : inputPath
const outputDir = resolve(args[1]!)
const scopedRoot = fileURLToPath(new URL('../../../docs/research/owner-product-integration', import.meta.url))
// macOS keeps /tmp under /private/tmp; Linux (CI) has no such folder.
const allowedRoots = await Promise.all([scopedRoot, tmpdir(), ...(process.platform === 'darwin' ? ['/private/tmp'] : [])].map((path) => realpath(path)))
const contains = (root: string, target: string): boolean => {
  const delta = relative(root, target)
  return delta === '' || (!isAbsolute(delta) && delta !== '..' && !delta.startsWith(`..${sep}`))
}
// Resolve all existing ancestors before checking containment. A directory named
// "tmp" elsewhere, traversal, and a symlink out of scope do not grant permission.
async function resolvedTarget(path: string): Promise<string> {
  try { return await realpath(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    try { await lstat(path); throw new Error('Output scope contains a dangling symlink') } catch (statError) {
      if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError
    }
    return join(await resolvedTarget(dirname(path)), relative(dirname(path), path))
  }
}
const actualOutput = await resolvedTarget(outputDir)
if (!allowedRoots.some((root) => contains(root, actualOutput)) || contains(inputPath, actualOutput) || contains(actualOutput, inputPath)) {
  throw new Error('Output directory is outside the permitted scope or overlaps inputs')
}
const names = singleFile ? [basename(inputPath)] : ['2026-10-04-owner-product-evidence.json', '2026-10-04-owner-product-evidence.md', '2026-10-04-product-intelligence-workflow.json', '2026-10-04-repeatable-product-intelligence.md']
const inputs = await Promise.all(names.map(async (path) => {
  const bytes = await readFile(join(inputDir, path))
  return { path, bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}))
const previous = args[3] === undefined ? undefined : JSON.parse(await readFile(resolve(args[3]), 'utf8'))
const manifest = compileOwnerProductEvidence(JSON.parse(inputs[0]!.bytes.toString('utf8')), previous)
const serialized = `${JSON.stringify(manifest, null, 2)}\n`
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
async function fileBindings(paths: string[]): Promise<{ path: string; sha256: string }[]> {
  return Promise.all(paths.map(async (path) => ({ path, sha256: createHash('sha256').update(await readFile(join(repoRoot, path))).digest('hex') })))
}
const receipt = {
  schemaVersion: 1, compilerVersion: ownerProductEvidenceCompilerVersion,
  compilerInputs: await fileBindings(['packages/planner/src/owner-product-evidence.ts', 'packages/planner/scripts/compile-owner-product-evidence.ts']),
  importerContractInputs: await fileBindings(['apps/web/scripts/catalog-ingest.mjs', 'convex/catalog.ts', 'convex/catalogValues.ts']),
  inputs: inputs.map(({ path, sha256 }) => ({ path, sha256 })),
  canonicalEvidenceSha256: manifest.extraction.inputSha256,
  output: 'manifest.json', outputSha256: createHash('sha256').update(serialized).digest('hex'),
  previousOutputSha256: previous === undefined ? null : createHash('sha256').update(await readFile(resolve(args[3]!))).digest('hex'),
  entries: manifest.entries.length, reviewRecords: manifest.review.records.length,
  acceptedClaimIds: [], backendWrites: false, householdWrites: false,
}
await mkdir(actualOutput, { recursive: true })
if (await realpath(actualOutput) !== actualOutput) throw new Error('Output scope changed during directory creation')
// Refuse either existing file before creating the other. Exclusive writes still
// protect against a concurrent creator between this check and the writes.
for (const name of ['manifest.json', 'receipt.json']) {
  try { await lstat(join(actualOutput, name)); throw new Error(`Refusing to overwrite ${name}`) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
await writeFile(join(actualOutput, 'manifest.json'), serialized, { flag: 'wx' })
await writeFile(join(actualOutput, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
process.stdout.write(`${JSON.stringify({ entries: receipt.entries, reviewRecords: receipt.reviewRecords, outputSha256: receipt.outputSha256, reviewStatus: manifest.extraction.reviewStatus })}\n`)
