import { expect, test } from 'vitest'

import { machineAnswer, type MachineCalls } from '@/laundry/fullness-step'

test('the logo answered at the machine is saved to every identical washer, then the steps are read again', async () => {
  const sent: [string, unknown][] = []
  const call = (name: string, result: unknown = null) => async (args: unknown) => {
    sent.push([name, args])
    return result
  }
  const calls = {
    recordDrumFullness: call('recordDrumFullness', { steps: [] }),
    answerLabelRow: call('answerLabelRow'),
    updateMachine: call('updateMachine'),
    recordAction: call('recordAction'),
    washerGroup: (machineId: string) => [machineId, 'w1', 'w4'],
  } as unknown as MachineCalls
  const outcome = await machineAnswer({ kind: 'he', machineId: 'w2', highEfficiency: true }, { sessionId: 's1', actionId: 'a1', machine: 'washer', size: 'medium', product: 'Tide' }, calls)
  expect(sent).toEqual([
    ['updateMachine', { machineId: 'w2', highEfficiency: true }],
    ['updateMachine', { machineId: 'w1', highEfficiency: true }],
    ['updateMachine', { machineId: 'w4', highEfficiency: true }],
    ['recordDrumFullness', { sessionId: 's1', machine: 'washer', size: 'medium' }],
  ])
  expect(outcome).toEqual({ steps: [], toast: null })
})
