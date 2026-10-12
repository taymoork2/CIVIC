import assert from 'node:assert/strict'

import { requirementCheck } from './index.ts'

// A wearer's product requirements: a recorded fact can break one (conflict); a missing fact is unknown, never assumed fine.
const fragranceFree = { fragranceFree: true }
assert.deepEqual(requirementCheck({ id: 'tide', fragrance: 'scented' }, [fragranceFree]), { status: 'conflict', needs: ['fragrance_free'] })
assert.deepEqual(requirementCheck({ id: 'tide' }, [fragranceFree]), { status: 'unknown', needs: ['fragrance_free'] })
assert.deepEqual(requirementCheck({ id: 'free', fragrance: 'free' }, [fragranceFree]), { status: 'ok', needs: ['fragrance_free'] })
assert.equal(requirementCheck({ id: 'tide', fragrance: 'scented' }, [{ ...fragranceFree, acceptedSupplyIds: ['tide'] }]).status, 'ok', 'a product accepted on the profile passes')
assert.equal(requirementCheck({ id: 'dyed', dye: 'dyed' }, [{ dyeFree: true }]).status, 'conflict')
assert.equal(requirementCheck({ id: 'x', ingredients: [] }, [{ avoidIngredients: ['Methylisothiazolinone'] }]).status, 'unknown', 'no recorded ingredients: unknown')
assert.equal(requirementCheck({ id: 'x', ingredients: ['Water', 'methylisothiazolinone'] }, [{ avoidIngredients: ['Methylisothiazolinone'] }]).status, 'conflict')
assert.equal(requirementCheck({ id: 'x', ingredients: ['Water', '1,2-Benzisothiazolin-3-one'] }, [{ avoidIngredients: ['1,2-benzisothiazolin-3-one'] }]).status, 'conflict', 'a comma within one ingredient name remains matchable')
assert.equal(requirementCheck({ id: 'x' }, [{ avoidIngredients: ['1,2-benzisothiazolin-3-one'] }]).status, 'unknown', 'ingredient chips do not establish missing product evidence')
assert.equal(requirementCheck({ id: 'x', fragrance: 'scented' }, [null, undefined, {}]).status, 'ok', 'no requirements recorded: nothing to check')
// Conflict wins over unknown when wearers differ.
assert.equal(requirementCheck({ id: 'x', fragrance: 'scented' }, [{ dyeFree: true }, fragranceFree]).status, 'conflict')

console.log('requirement checks passed')
