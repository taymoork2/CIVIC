import { describe, expect, it } from 'vitest'
import { routineLabelDefaults } from './personal-routine'

describe('wash and dry label defaults', () => {
  it('uses recorded wash settings and tumble heat without inventing missing values', () => {
    expect(routineLabelDefaults([{ care: { washMethod: 'machine', cycle: 'delicate', maxTemperatureC: 40, dryMethod: 'tumble_dry', dryHeat: 'no_heat' } }])).toEqual({ method: 'machine', cycle: 'delicate', temperature: '40', dryMethod: 'tumble', heat: 'no_heat' })
    expect(routineLabelDefaults([{ care: { washMethod: 'hand_wash', dryMethod: 'do_not_tumble_dry' } }])).toEqual({ method: 'hand_wash', cycle: '', temperature: '', dryMethod: '', heat: '' })
  })

  it('prefills natural drying methods but leaves prohibitions and unknown labels unanswered', () => {
    for (const [dryMethod, expected] of [['dry_flat', 'flat'], ['line_dry', 'rack_line'], ['drip_dry', 'rack_line']] as const) {
      expect(routineLabelDefaults([{ care: { dryMethod } }]).dryMethod).toBe(expected)
    }
    for (const washMethod of ['unknown', 'do_not_wash', 'dry_clean_only'] as const) {
      expect(routineLabelDefaults([{ care: { washMethod } }]).method).toBe('')
    }
    expect(routineLabelDefaults([{ care: null }])).toEqual({ method: '', cycle: '', temperature: '', dryMethod: '', heat: '' })
    expect(routineLabelDefaults([])).toEqual(routineLabelDefaults([{ care: null }]))
  })

  it('prefills only values shared by every selected label', () => {
    const care = { washMethod: 'machine', cycle: 'normal', maxTemperatureC: 30, dryMethod: 'tumble_dry', dryHeat: 'low' } as const
    expect(routineLabelDefaults([{ care }, { care: { ...care, maxTemperatureC: 40, dryHeat: 'high' } }])).toEqual({ method: 'machine', cycle: 'normal', temperature: '', dryMethod: 'tumble', heat: '' })
    expect(routineLabelDefaults([{ care }, { care: null }])).toEqual(routineLabelDefaults([]))
  })
})
