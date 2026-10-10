import { isRecord } from './evidence.ts'
import type { JsonValue } from './types.ts'

export function canonicalize(value: unknown, omitUndefined = false): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Planner input contains a non-finite number')
    return value
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry, omitUndefined))
  if (isRecord(value)) {
    const result: Record<string, JsonValue> = {}
    for (const key of Object.keys(value).sort()) {
      const entry = value[key]
      if (entry === undefined && omitUndefined) continue
      result[key] = entry === undefined ? null : canonicalize(entry, omitUndefined)
    }
    return result
  }
  throw new Error('Planner input must contain only JSON-compatible values')
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function utf8Bytes(value: string): number[] {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00
        index += 1
      }
    }
    if (code <= 0x7f) bytes.push(code)
    else if (code <= 0x7ff) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code <= 0xffff) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return bytes
}

const sha256Constants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

/** Hex SHA-256 of a UTF-8 string, computed in plain JavaScript so every runtime agrees. */
export function sha256(value: string): string {
  const bytes = utf8Bytes(value)
  const bitLengthLow = (bytes.length * 8) >>> 0
  const bitLengthHigh = Math.floor(bytes.length / 0x20000000)
  bytes.push(0x80)
  while ((bytes.length + 8) % 64 !== 0) bytes.push(0)
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((bitLengthHigh >>> shift) & 0xff)
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((bitLengthLow >>> shift) & 0xff)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const schedule = new Array<number>(64).fill(0)
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4
      schedule[index] = ((bytes[position]! << 24) | (bytes[position + 1]! << 16) | (bytes[position + 2]! << 8) | bytes[position + 3]!) >>> 0
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(schedule[index - 15]!, 7) ^ rotateRight(schedule[index - 15]!, 18) ^ (schedule[index - 15]! >>> 3)
      const s1 = rotateRight(schedule[index - 2]!, 17) ^ rotateRight(schedule[index - 2]!, 19) ^ (schedule[index - 2]! >>> 10)
      schedule[index] = (schedule[index - 16]! + s0 + schedule[index - 7]! + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + ch + sha256Constants[index]! + schedule[index]!) >>> 0
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, '0')).join('')
}

