import { describe, expect, it } from 'vitest'
import type { DetectedHand } from './handRoles'
import { TwoFingerGate } from './twoFingerGate'

const hand = (gesture: string, score = .9): DetectedHand => ({
  landmarks: [], handedness: 'Right', gesture, score,
})

describe('TwoFingerGate', () => {
  it('reveals the arrow only after a stable two-finger gesture', () => {
    const gate = new TwoFingerGate()
    expect(gate.update(hand('Victory'), 0)).toBe(false)
    expect(gate.update(hand('Victory'), 199)).toBe(false)
    expect(gate.update(hand('Victory'), 200)).toBe(true)
    expect(gate.update(hand('Open_Palm'), 250)).toBe(true)
    expect(gate.update(hand('Open_Palm'), 600)).toBe(false)
  })

  it('rejects low confidence and resets when the second hand disappears', () => {
    const gate = new TwoFingerGate()
    gate.update(hand('Victory', .5), 0)
    expect(gate.update(hand('Victory', .9), 200)).toBe(false)
    expect(gate.update(hand('Victory', .9), 400)).toBe(true)
    expect(gate.update(null, 410)).toBe(true)
    expect(gate.update(null, 760)).toBe(false)
  })

  it('accepts two extended pointing fingers even when they are not classified as Victory', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
    const set = (index: number, x: number, y: number) => { landmarks[index] = { x, y, z: 0, visibility: 1 } }
    set(5, -.1, .3); set(6, -.1, .5); set(8, -.1, .9)
    set(9, .1, .3); set(10, .1, .5); set(12, .1, .9)
    set(13, .25, .3); set(14, .25, .47); set(16, .25, .33)
    set(17, .4, .3); set(18, .4, .45); set(20, .4, .31)
    const twoFingers = { ...hand('None', .1), landmarks }
    const gate = new TwoFingerGate()
    expect(gate.update(twoFingers, 0)).toBe(false)
    expect(gate.update(twoFingers, 200)).toBe(true)
  })

  it('keeps the arrow through a palm flip using 3D finger joints', () => {
    const worldLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
    const set = (index: number, x: number, y: number, z = 0) => {
      worldLandmarks[index] = { x, y, z, visibility: 1 }
    }
    set(5, -.1, 0); set(6, -.1, 1, .1); set(7, -.1, 2, .2); set(8, -.1, 3, .3)
    set(9, .1, 0); set(10, .1, 1, .1); set(11, .1, 2, .2); set(12, .1, 3, .3)
    set(13, .3, 0); set(14, .3, 1); set(15, .3, 1.3); set(16, .3, .2)
    set(17, .5, 0); set(18, .5, 1); set(19, .5, 1.3); set(20, .5, .2)
    const gate = new TwoFingerGate()
    const twoFingers = { ...hand('None', .1), worldLandmarks }
    gate.update(twoFingers, 0)
    expect(gate.update(twoFingers, 200)).toBe(true)
    const flipped = worldLandmarks.map((point) => ({ ...point, x: -point.x, z: -point.z }))
    expect(gate.update({ ...twoFingers, worldLandmarks: flipped }, 800)).toBe(true)
    expect(gate.update(hand('None', .1), 1200)).toBe(true)

    const folded = flipped.map((point) => ({ ...point }))
    folded[8].y = .1
    folded[12].y = .1
    expect(gate.update({ ...twoFingers, worldLandmarks: folded }, 1300)).toBe(true)
    expect(gate.update({ ...twoFingers, worldLandmarks: folded }, 1650)).toBe(false)
  })
})
