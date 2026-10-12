import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi as api } from 'convex/server'

// Input and tokens remain on private pipes. Only aggregate verification results leave this helper.
let stage = 'reading input'
try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const cookie = input.cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
  stage = 'restored authentication token'
  const response = await fetch('http://127.0.0.1:3231/api/auth/convex/token', {
    headers: { cookie }, signal: AbortSignal.timeout(15_000),
  })
  const { token } = await response.json()
  if (!response.ok || typeof token !== 'string') throw new Error('Restored authentication failed')
  const client = new ConvexHttpClient('http://127.0.0.1:3230')
  client.setAuth(token)
  stage = 'household access'
  const status = await client.query(api.households.onboardingStatus, {})
  if (status.principalKey !== input.principalKey
    || !status.households.some(({ householdId }) => householdId === input.householdId)) throw new Error('Restored household access failed')
  stage = 'inventory'
  const inventory = await client.query(api.inventory.list, { householdId: input.householdId })
  const ids = inventory.textiles.map(({ textileId }) => textileId).sort()
  if (JSON.stringify(ids) !== JSON.stringify(input.textileIds.sort())) throw new Error('Restored inventory differs')
  stage = 'history'
  let historyRecords = 0
  for (const textileId of input.historyTextileIds) {
    const records = await client.query(api.sessions.washRecordsForTextile, { textileId })
    historyRecords += records.length
    if (!records.length) throw new Error('Restored history is inaccessible')
  }
  stage = 'active loads'
  for (const session of input.sessions) {
    const restored = await client.query(api.execution.sessionDetail, { sessionId: session._id })
    if (restored.status !== session.status || restored.machineStartedAt !== (session.machineStartedAt ?? null)) {
      throw new Error('Restored active load differs')
    }
  }
  stage = 'private result controls'
  const privateChecks = input.privateChecks ?? { preferences: [], guidance: [] }
  for (const preference of privateChecks.preferences) {
    const restored = await client.query(api.personalAdaptation.controls, {
      householdId: input.householdId, ...(preference.textileId === null ? {} : { textileId: preference.textileId }),
    })
    if (!isDeepStrictEqual(restored, preference.expected)) throw new Error('Restored private controls differ')
  }
  stage = 'saved private guidance'
  let currentGuidance = 0, staleGuidance = 0
  for (const guidance of privateChecks.guidance) {
    const restored = await client.query(api.personalSuggestions.savedForPlan, { planId: guidance.planId, loadId: guidance.loadId })
    if (restored === null || restored.guidanceId !== guidance._id || restored.revision !== guidance.revision
      || restored.savedAt !== guidance.savedAt || restored.inputHash !== guidance.inputHash) {
      throw new Error('Restored saved guidance differs')
    }
    if (restored.status === 'current') {
      if (restored.result.inputHash !== guidance.inputHash
        || !isDeepStrictEqual(restored.result.inputSnapshot.personalSuggestions, guidance.personalInput)) {
        throw new Error('Restored personal planner input differs')
      }
      const preview = await client.query(api.personalSuggestions.plannerPreview, {
        planId: guidance.planId, loadId: guidance.loadId, supplyIds: guidance.supplyIds,
        dimension: guidance.dimension, checkedWhen: guidance.checkedWhen,
      })
      if (!isDeepStrictEqual(preview.result, restored.result)) throw new Error('Restored personal guidance cannot replay')
      currentGuidance++
    } else if (restored.status === 'stale' && !Object.hasOwn(restored, 'result')) staleGuidance++
    else throw new Error('Obsolete private guidance exposed a result')
  }
  let fileVerified = false
  if (input.photoId) {
    stage = 'restored synthetic file'
    const { url } = await client.mutation(api.photos.issueViewUrl, { photoId: input.photoId })
    const file = await fetch(new URL(url, 'http://127.0.0.1:3231'), { signal: AbortSignal.timeout(10_000) })
    if (!file.ok || file.headers.get('content-type') !== 'image/png' || (await file.arrayBuffer()).byteLength !== 68) {
      throw new Error('Restored file is inaccessible')
    }
    fileVerified = true
  }
  stage = 'anonymous denial'
  const anonymous = new ConvexHttpClient('http://127.0.0.1:3230')
  let denied = false
  try { await anonymous.query(api.inventory.list, { householdId: input.householdId }) } catch { denied = true }
  if (!denied) throw new Error('Anonymous restored inventory access was accepted')
  console.log(JSON.stringify({ authenticationVerified: true, householdAccessVerified: true,
    inventoryMatched: true, inventoryPieces: ids.length, historyRecords, sessionsVerified: input.sessions.length,
    anonymousDenied: true, fileVerified, privatePreferencesVerified: privateChecks.preferences.length,
    privateGuidanceVerified: privateChecks.guidance.length, currentGuidance, staleGuidance }))
} catch {
  console.error(`Restored application verification failed at ${stage}; private details suppressed.`)
  process.exitCode = 1
}
