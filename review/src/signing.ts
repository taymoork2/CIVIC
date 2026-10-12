import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { GraphDocument } from '../../graph/src/index.ts'

// Roadmap step 5: a sync names its person in a trailer, and a signature proves it. Each
// person keeps an Ed25519 private key on their own machine; their public keys are listed in
// civic.access.json on the default branch, so adding or removing a key is a reviewed change.
// Signatures cover the snapshot itself, not the git commit, so a hosted remote can carry the
// same proof later. Node's own crypto does the work: no gpg or ssh-keygen setup is needed.

export const KEY_PREFIX = 'ed25519:'

/** The bytes a sync signs: what it builds on, exactly what it shares, and who shares it. */
export function signedPayload(parent: string | undefined, document: GraphDocument, actor: string): Buffer {
  const records = createHash('sha256').update(canonical(document)).digest('hex')
  return Buffer.from(`civic-sync/1\nparent ${parent ?? 'none'}\nrecords ${records}\nactor ${actor}\n`)
}

/** How a snapshot is written and hashed everywhere: two-space JSON with a trailing newline. */
export function canonical(document: GraphDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

export function signPayload(key: KeyObject, payload: Buffer): string {
  return `${KEY_PREFIX}${sign(null, payload, key).toString('base64')}`
}

/** The public key (one of the person's listed keys) that made the signature, if any did. */
export function signedBy(signature: string, payload: Buffer, keys: string[]): string | undefined {
  if (!signature.startsWith(KEY_PREFIX)) return undefined
  const bytes = Buffer.from(signature.slice(KEY_PREFIX.length), 'base64')
  return keys.find((key) => {
    try {
      return verify(null, payload, publicKeyOf(key), bytes)
    } catch {
      return false
    }
  })
}

/** `ed25519:<base64 raw key>`, as civic.access.json lists it. */
export function publicKeyText(key: KeyObject): string {
  const jwk = createPublicKey(key).export({ format: 'jwk' })
  return `${KEY_PREFIX}${Buffer.from(jwk.x!, 'base64url').toString('base64')}`
}

function publicKeyOf(text: string): KeyObject {
  if (!text.startsWith(KEY_PREFIX)) throw new Error(`A key is ${KEY_PREFIX}<base64>. Got ${text}.`)
  const raw = Buffer.from(text.slice(KEY_PREFIX.length), 'base64')
  if (raw.length !== 32) throw new Error(`An Ed25519 public key is 32 bytes. Got ${raw.length} in ${text}.`)
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' })
}

/** Makes a key pair and writes the private key, readable only by its owner. Returns the public key text. */
export function generateKey(file: string): string {
  const { privateKey } = generateKeyPairSync('ed25519')
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' })
  chmodSync(file, 0o600)
  return publicKeyText(privateKey)
}

export function readKey(file: string): KeyObject {
  return createPrivateKey(readFileSync(file, 'utf8'))
}
