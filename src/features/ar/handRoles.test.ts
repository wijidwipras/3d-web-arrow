import { describe, expect, it } from 'vitest'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { HandRoleAssigner, type DetectedHand } from './handRoles'

const hand = (side: string, x: number): DetectedHand => ({
  handedness: side,
  gesture: null,
  score: 0,
  landmarks: [{ x, y: .5, z: 0, visibility: 1 } as NormalizedLandmark],
})

describe('HandRoleAssigner', () => {
  it('keeps the original bow hand when detection order swaps', () => {
    const roles = new HandRoleAssigner()
    const left = hand('Left', .25)
    const right = hand('Right', .75)
    expect(roles.update([left]).bow).toBe(left)
    expect(roles.update([right, left])).toEqual({ bow: left, arrow: right })
    expect(roles.update([left, right])).toEqual({ bow: left, arrow: right })
  })

  it('keeps right hand assigned to the arrow while the left bow hand disappears and returns', () => {
    const roles = new HandRoleAssigner()
    const left = hand('Left', .25)
    const right = hand('Right', .75)
    expect(roles.update([left])).toEqual({ bow: left, arrow: null })
    expect(roles.update([left, right])).toEqual({ bow: left, arrow: right })
    expect(roles.update([right])).toEqual({ bow: null, arrow: right })
    expect(roles.update([])).toEqual({ bow: null, arrow: null })
    expect(roles.update([right])).toEqual({ bow: null, arrow: right })
    expect(roles.update([right, left])).toEqual({ bow: left, arrow: right })
  })

  it('uses wrist position when the arrow hand is turned and handedness briefly flips', () => {
    const roles = new HandRoleAssigner()
    const left = hand('Left', .2)
    const right = hand('Right', .8)
    roles.update([left, right])
    const turnedRight = hand('Left', .79)
    expect(roles.update([turnedRight])).toEqual({ bow: null, arrow: turnedRight })
    expect(roles.update([turnedRight, left])).toEqual({ bow: left, arrow: turnedRight })
  })

  it('resets roles only for a new camera session', () => {
    const roles = new HandRoleAssigner()
    roles.update([hand('Left', .25)])
    const right = hand('Right', .75)
    expect(roles.update([right])).toEqual({ bow: null, arrow: right })
    roles.reset()
    expect(roles.update([right])).toEqual({ bow: right, arrow: null })
  })

  it('uses wrist proximity when handedness is ambiguous', () => {
    const roles = new HandRoleAssigner()
    const near = hand('Left', .2)
    roles.update([near])
    const other = hand('Left', .8)
    expect(roles.update([other, near])).toEqual({ bow: near, arrow: other })
  })
})

describe('nearby hand identity', () => {
  it('keeps assets on their hands when nearby labels and detection order flip', () => {
    const roles = new HandRoleAssigner()
    roles.update([hand('Left', .44), hand('Right', .56)])
    const bow = hand('Right', .46)
    const arrow = hand('Left', .54)
    expect(roles.update([arrow, bow])).toEqual({ bow, arrow })
    const nearerBow = hand('Right', .48)
    const nearerArrow = hand('Left', .52)
    expect(roles.update([nearerBow, nearerArrow])).toEqual({ bow: nearerBow, arrow: nearerArrow })
    expect(roles.update([nearerArrow])).toEqual({ bow: null, arrow: nearerArrow })
  })

  it('preserves identities through ambiguous overlap and reacquires them', () => {
    const roles = new HandRoleAssigner()
    roles.update([hand('Left', .47), hand('Right', .53)])
    expect(roles.update([hand('Right', .5), hand('Left', .5)])).toEqual({ bow: null, arrow: null })
    expect(roles.update([hand('Left', .5)])).toEqual({ bow: null, arrow: null })
    const bow = hand('Left', .46)
    const arrow = hand('Right', .54)
    expect(roles.update([arrow, bow])).toEqual({ bow, arrow })
  })
})
