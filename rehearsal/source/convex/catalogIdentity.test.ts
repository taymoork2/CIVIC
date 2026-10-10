import { expect, test } from 'vitest'
import { normalizeGtin } from './catalogIdentity'

test('UPC/EAN/GTIN normalize only with valid check digits and preserve packaging indicators', () => {
  for (const value of ['030772103111', '0 30772-10311 1', '0030772103111', '00030772103111', 'gtin14:00030772103111', 'UPCA:030772103111', 'ean13:0030772103111']) expect(normalizeGtin(value)).toBe('00030772103111')
  expect(normalizeGtin('96385074')).toBe('00000096385074')
  expect(normalizeGtin('ean8:96385074')).toBe('00000096385074')
  expect(normalizeGtin('10030772103118')).toBe('10030772103118')
  for (const value of ['030772103110', '00000000', '00000000000000', '123', '03077210311', '0307721031110', 'source-product-id:10000443', 'material-number:42019647', 'gtin14:030772103111', 'upca:00030772103111', 'ean13:030772103111', '+030772103111', '3.0772103111e10', '０３０７７２１０３１１１', 'a030772103111', ' '.repeat(65) + '030772103111']) expect(normalizeGtin(value)).toBeNull()
})
