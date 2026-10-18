import { describe, expect, it } from 'vitest'
import type { DetectedHand } from './handRoles'
import { FiveFingerGate } from './fiveFingerGate'

const hand = (gesture: string, score = .9): DetectedHand => ({
  landmarks: [], handedness: 'Left', gesture, score,
})

describe('FiveFingerGate', () => {
  it('summons the bow after a stable open palm and keeps it while gripping', () => {
    const gate = new FiveFingerGate()
    expect(gate.update(hand('Victory'), 0)).toBe(false)
    expect(gate.update(hand('Open_Palm'), 50)).toBe(false)
    expect(gate.update(hand('Open_Palm'), 199)).toBe(false)
    expect(gate.update(hand('Open_Palm'), 200)).toBe(true)
    expect(gate.update(hand('Closed_Fist'), 500)).toBe(true)
  })

  it('survives a brief tracking loss but needs five fingers again after the hand leaves', () => {
    const gate = new FiveFingerGate()
    gate.update(hand('Open_Palm'), 0)
    gate.update(hand('Open_Palm'), 150)
    expect(gate.update(null, 200)).toBe(true)
    expect(gate.update(null, 550)).toBe(false)
    expect(gate.update(hand('Closed_Fist'), 600)).toBe(false)
  })

  it('accepts five straight 3D fingers when the gesture classifier is uncertain', () => {
    const worldLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
    for (const [base, x] of [[1, 0], [5, 1], [9, 2], [13, 3], [17, 4]]) {
      worldLandmarks[base] = { x, y: 0, z: 0, visibility: 1 }
      worldLandmarks[base + 1] = { x, y: 1, z: 0, visibility: 1 }
      worldLandmarks[base + 2] = { x, y: 2, z: 0, visibility: 1 }
      worldLandmarks[base + 3] = { x, y: 3, z: 0, visibility: 1 }
    }
    const open = { ...hand('None', .1), worldLandmarks }
    const gate = new FiveFingerGate()
    expect(gate.update(open, 0)).toBe(false)
    expect(gate.update(open, 150)).toBe(true)
  })
})
