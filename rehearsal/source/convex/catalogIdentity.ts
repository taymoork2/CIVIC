/** UPC-A, EAN-8/13 and GTIN-14 share a check digit and zero-padded GTIN-14 identity.
 * UPC-E, manufacturer material numbers and source IDs are deliberately unsupported.
 */
export function normalizeGtin(value: string): string | null {
  if (value.length > 64) return null
  const input = value.trim()
  const tagged = /^(upca|ean8|ean13|gtin14):([\d\s-]+)$/i.exec(input)
  const digits = (tagged?.[2] ?? input).replace(/[\s-]/g, '')
  if (!/^[0-9]+$/.test(digits) || /^0+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return null
  const lengths: Record<string, number> = { upca: 12, ean8: 8, ean13: 13, gtin14: 14 }
  if (tagged && digits.length !== lengths[tagged[1]!.toLowerCase()]) return null
  let sum = 0
  for (let index = digits.length - 2, weight = 3; index >= 0; index--, weight = 4 - weight) sum += Number(digits[index]) * weight
  if ((10 - sum % 10) % 10 !== Number(digits.at(-1))) return null
  return digits.padStart(14, '0')
}
