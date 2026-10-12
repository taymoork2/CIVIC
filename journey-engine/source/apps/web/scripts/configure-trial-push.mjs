// Run only after owner approval. Never rotates an existing VAPID configuration.
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = fileURLToPath(new URL('../', import.meta.url))
const settings = await readFile(join(web, '.env.local'), 'utf8')
if (!/^VITE_CONVEX_URL=http:\/\/127\.0\.0\.1:3220\s*$/m.test(settings)
  || !/^CONVEX_DEPLOYMENT=anonymous:anonymous-agent\s*$/m.test(settings)) {
  throw new Error('This script requires the designated anonymous phone-trial backend on port 3220.')
}
const health = await fetch('http://127.0.0.1:3220/version', { signal: AbortSignal.timeout(5000) })
if (!health.ok) throw new Error('Start the existing worktree backend before configuring push.')
const env = { ...process.env, CONVEX_AGENT_MODE: 'anonymous' }
for (const name of ['CONVEX_DEPLOYMENT', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY', 'CONVEX_DEPLOY_KEY']) delete env[name]
// Capture privately: CLI output can contain credentials and must never reach the log.
const existing = spawnSync(join(web, 'node_modules/.bin/convex'), ['env', 'list'], { cwd: web, env, encoding: 'utf8', timeout: 30_000 })
if (existing.status !== 0) throw new Error('Could not inspect configuration presence; no credentials changed.')
if (/WEB_PUSH_(PUBLIC_KEY|PRIVATE_KEY|SUBJECT)=/.test(existing.stdout)) throw new Error('Push settings already exist. This helper will not replace or rotate them.')
if (process.argv[2] === '--check') {
  console.log('Ready to configure only the anonymous backend on 127.0.0.1:3220. No keys generated or settings changed.')
  process.exit(0)
}
if (process.argv[2] !== '--configure' || !process.argv[3]) {
  throw new Error('After owner approval: node scripts/configure-trial-push.mjs --configure <https-contact-url-or-mailto>')
}
const contact = new URL(process.argv[3])
if (!['https:', 'mailto:'].includes(contact.protocol) || contact.username || contact.password
  || (contact.protocol === 'https:' && ['localhost', '127.0.0.1'].includes(contact.hostname))) {
  throw new Error('Use an HTTPS contact URL or mailto address for the VAPID subject.')
}
const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicBytes = await crypto.subtle.exportKey('raw', key.publicKey)
const privateJwk = await crypto.subtle.exportKey('jwk', key.privateKey)
const publicKey = Buffer.from(publicBytes).toString('base64url')
const temporary = await mkdtemp(join(tmpdir(), 'washcloset-trial-push-'))
try {
  const path = join(temporary, 'push.env')
  await writeFile(path, `WEB_PUSH_PUBLIC_KEY=${publicKey}\nWEB_PUSH_PRIVATE_KEY=${privateJwk.d}\nWEB_PUSH_SUBJECT=${contact.href}\n`, { mode: 0o600 })
  const result = spawnSync(join(web, 'node_modules/.bin/convex'), ['env', 'set', '--from-file', path], { cwd: web, env, encoding: 'utf8', timeout: 30_000 })
  if (result.status !== 0) {
    // CLI diagnostics may contain key material. Preserve neither output nor a secret-bearing log.
    throw new Error('Push configuration was not confirmed. Existing settings were not force-replaced; inspect their presence before retrying.')
  }
  console.log('VAPID configuration saved to the designated anonymous backend. No device subscribed and no notification sent.')
} finally {
  // This is solely the exact temporary directory created above; it never contains project data.
  await rm(temporary, { recursive: true, force: true })
}
