import { expect, test } from 'vitest'
import { balanceFabric, fabricProblem, formatFabric, parseFabric, detailsFromMaterial, detailsForMaterial, searchFabrics } from './fabric'

test('fabric composition keeps blends, custom names and legacy single fibers', () => {
  for (const material of [null, 'cotton', 'other', '80% cotton, 20% polyester', '95% cotton, 5% elastane', '1.5% silk, 98.5% polyester', 'cashmere']) {
    expect(formatFabric(parseFabric(material))).toBe(material)
    expect(fabricProblem(material)).toBeNull()
  }
  expect(formatFabric(parseFabric('cotton/polyester'))).toBe('cotton, polyester')
  expect(parseFabric('80% cotton, 20% polyester').map((part) => part.fiber)).toEqual(['cotton', 'polyester'])
  expect(parseFabric('20% Cashmere')[0]).toMatchObject({ fiber: 'cashmere', name: '', percentage: 20 })
})

test('qualified fibers and aliases normalize composition without losing reported details', () => {
  const material = '95% Supima cotton, 5% spandex'
  expect(formatFabric(parseFabric(material))).toBe('95% cotton, 5% elastane')
  expect(detailsFromMaterial(material)).toEqual({ fibers: [{ fiber: 'cotton', details: ['Supima'] }] })
  expect(detailsFromMaterial('50% Pima cotton, 50% Supima cotton')).toEqual({ fibers: [{ fiber: 'cotton', details: ['Pima', 'Supima'] }] })
  expect(detailsForMaterial('wool', detailsFromMaterial(material))).toBeUndefined()
  for (const name of ['TENCEL', 'bamboo', 'microfiber', 'GORE-TEX', 'Mystery cotton', 'constructor', '__proto__']) expect(parseFabric(name)[0]!.fiber).toBe('other')
  expect(formatFabric(parseFabric('60% TENCEL Modal, 40% polyamide'))).toBe('60% modal, 40% nylon')
})

test('fabric search finds optional details and aliases without inferring fiber from an ambiguous brand', () => {
  for (const query of ['Supima', 'supima cotton', ' SUPIMA® ']) expect(searchFabrics(query)).toEqual([{ fiber: 'cotton', detail: 'Supima', label: 'Supima · Cotton' }])
  expect(searchFabrics('merino')).toEqual([{ fiber: 'wool', detail: 'Merino', label: 'Merino · Wool' }])
  expect(searchFabrics('spandex')[0]).toEqual({ fiber: 'elastane', label: 'Elastane / spandex' })
  expect(searchFabrics('spandex').every((match) => match.fiber === 'elastane')).toBe(true)
  expect(searchFabrics('TENCEL').map((match) => match.fiber)).toEqual(['modal', 'lyocell'])
  expect(searchFabrics('microfiber').map((match) => match.fiber)).toEqual(['polyester', 'nylon'])
  for (const query of ['', 'unknown brand', 'GORE-TEX']) expect(searchFabrics(query)).toEqual([])
})

test('percentages are optional but partial, invalid and non-totaling compositions cannot advance', () => {
  for (const material of ['80% cotton, polyester', '80% cotton, 30% polyester', '0% cotton, 100% polyester', '-1% cotton, 101% polyester', '80% cotton', 'x'.repeat(241)]) expect(fabricProblem(material)).not.toBeNull()
  expect(fabricProblem('cotton, polyester, Elastane')).toBeNull()
  expect(fabricProblem('33.3% cotton, 33.3% linen, 33.4% polyester')).toBeNull()
})

test('editing a blend balances the remainder without changing fibers or the original record', () => {
  const pair = parseFabric('50% cotton, 50% polyester')
  expect(formatFabric(balanceFabric(pair, 0, 90))).toBe('90% cotton, 10% polyester')
  expect(formatFabric(balanceFabric(pair, 1, 10))).toBe('90% cotton, 10% polyester')
  expect(formatFabric(pair)).toBe('50% cotton, 50% polyester')
  expect(formatFabric(balanceFabric(parseFabric('cotton, polyester'), 0, 90))).toBe('90% cotton, 10% polyester')
  const three = parseFabric('50% cotton, 40% polyester, 10% elastane')
  expect(formatFabric(balanceFabric(three, 0, 90))).toBe('90% cotton, 8% polyester, 2% elastane')
  const equal = balanceFabric(parseFabric('cotton, polyester, linen, silk'), 0, 90)
  expect(equal.map((part) => part.percentage)).toEqual([90, 3.333333, 3.333333, 3.333334])
  expect(fabricProblem(formatFabric(equal))).toBeNull()
  expect(formatFabric(balanceFabric(three, 0, null))).toBe('cotton, polyester, elastane')
  for (const value of [0, 100, 101, -1]) expect(fabricProblem(formatFabric(balanceFabric(pair, 0, value)))).not.toBeNull()
})
