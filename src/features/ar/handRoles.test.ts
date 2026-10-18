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
    expect(roles.update([right])).toEqual({ bow: null, arrow: right })
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

describe('initial left-hand bow assignment', () => {
  it('waits for the left hand when the right hand appears first', () => {
    const roles = new HandRoleAssigner()
    const right = hand('Right', .75)
    const left = hand('Left', .25)
    expect(roles.update([right])).toEqual({ bow: null, arrow: right })
    expect(roles.update([right, left])).toEqual({ bow: left, arrow: right })
  })

  it('selects the left hand when both appear in reversed detection order', () => {
    const roles = new HandRoleAssigner()
    const right = hand('Right', .75)
    const left = hand('Left', .25)
    expect(roles.update([right, left])).toEqual({ bow: left, arrow: right })
  })

  it('does not guess an initial bow hand from ambiguous labels', () => {
    const roles = new HandRoleAssigner()
    expect(roles.update([hand('Left', .25), hand('Left', .75)])).toEqual({ bow: null, arrow: null })
    expect(roles.update([{ ...hand('Left', .25), handedness: null }])).toEqual({ bow: null, arrow: null })
  })
})

describe('identity recovery', () => {
  it('expires old positions after tracking is lost', () => {
    const roles = new HandRoleAssigner()
    roles.update([hand('Left', .2), hand('Right', .8)], 0)
    roles.update([], 100)
    const right = hand('Right', .2)
    expect(roles.update([right], 600)).toEqual({ bow: null, arrow: right })
  })

  it('expires the missing hand independently while the other remains visible', () => {
    const roles = new HandRoleAssigner()
    const right = hand('Right', .8)
    roles.update([hand('Left', .2), right], 0)
    roles.update([right], 300)
    roles.update([right], 600)
    const left = hand('Left', .7)
    expect(roles.update([right, left], 650)).toEqual({ bow: left, arrow: right })
  })

  it('reacquires labels after hands cross through overlap', () => {
    const roles = new HandRoleAssigner()
    roles.update([hand('Left', .47), hand('Right', .53)], 0)
    roles.update([hand('Left', .5), hand('Right', .5)], 50)
    const left = hand('Left', .54)
    const right = hand('Right', .46)
    expect(roles.update([right, left], 100)).toEqual({ bow: left, arrow: right })
  })

  it('uses a confident label for a single hand equidistant from old wrists', () => {
    const roles = new HandRoleAssigner()
    roles.update([hand('Left', .2), hand('Right', .8)], 0)
    const left = hand('Left', .5)
    expect(roles.update([left], 50)).toEqual({ bow: left, arrow: null })
  })

  it('corrects sustained confident labels even when a crossing frame was missed', () => {
    const roles = new HandRoleAssigner()
    roles.update([hand('Left', .4), hand('Right', .6)], 0)
    const left = hand('Left', .6)
    const right = hand('Right', .4)
    roles.update([left, right], 50)
    roles.update([right, left], 150)
    expect(roles.update([left, right], 250)).toEqual({ bow: left, arrow: right })
  })

  it('does not initialize identity from low confidence labels', () => {
    const roles = new HandRoleAssigner()
    const left = { ...hand('Left', .2), handednessScore: .55 }
    expect(roles.update([left], 0)).toEqual({ bow: null, arrow: null })
    const confidentLeft = { ...left, handednessScore: .95 }
    expect(roles.update([confidentLeft], 50)).toEqual({ bow: confidentLeft, arrow: null })
  })

  it('ignores detections with no wrist landmarks', () => {
    const roles = new HandRoleAssigner()
    expect(roles.update([{ ...hand('Left', .2), landmarks: [] }], 0)).toEqual({ bow: null, arrow: null })
  })
})
