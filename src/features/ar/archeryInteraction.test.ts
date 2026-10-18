import { describe, expect, it } from 'vitest'
import type { DetectedHand } from './handRoles'
import type { ArrowPose, BowPose } from './handPose'
import { ArcheryController, bowStringCenter, type ArcheryInput } from './archeryInteraction'

const viewport = { width: 1000, height: 1000 }
const video = { width: 1000, height: 1000 }
const bowPose: BowPose = { x: 500, y: 400, length: 1000, rotation: -Math.PI / 2 }
const handArrowPose: ArrowPose = { x: 500, y: 500, length: 450, rotation: 0 }

function arrowHand(y: number, pinching: boolean, screenX = 500): DetectedHand {
  const x = 1 - screenX / 1000
  const landmarks = Array.from({ length: 21 }, () => ({ x, y: .5, z: 0, visibility: 1 }))
  landmarks[5] = { x: x - .05, y: .5, z: 0, visibility: 1 }
  landmarks[17] = { x: x + .05, y: .5, z: 0, visibility: 1 }
  landmarks[4] = { x: pinching ? x : x - .07, y, z: 0, visibility: 1 }
  landmarks[8] = { x: pinching ? x : x + .07, y, z: 0, visibility: 1 }
  return { landmarks, handedness: 'Right', gesture: pinching ? 'None' : 'Victory', score: .9 }
}

function input(now: number, hand: DetectedHand | null, gesture: boolean): ArcheryInput {
  return { now, arrowHand: hand, arrowGestureActive: gesture, bowPose, bowActive: true, handArrowPose, viewport, video }
}

function release(controller: ArcheryController, frame: ArcheryInput) {
  controller.update(frame)
  controller.update({ ...frame, now: frame.now + 50 })
  return controller.update({ ...frame, now: frame.now + 100 })
}

describe('ArcheryController', () => {
  it('nocks, draws and fires opposite the pulling direction', () => {
    const controller = new ArcheryController()
    const string = bowStringCenter(bowPose)
    expect(string.x).toBeCloseTo(500)
    expect(string.y).toBeGreaterThan(500)
    expect(controller.update(input(0, arrowHand(string.y / 1000, false), true)).phase).toBe('armed')
    const nocked = controller.update(input(50, arrowHand(string.y / 1000, true), false))
    expect(nocked.phase).toBe('nocked')
    expect(nocked.arrowPose?.rotation).toBeCloseTo(0)
    const drawing = controller.update(input(100, arrowHand(.72, true), false))
    expect(drawing.phase).toBe('drawing')
    expect(drawing.draw).toBeGreaterThan(.5)
    const released = release(controller, input(150, arrowHand(.72, false), false))
    expect(released.phase).toBe('flying')
    expect(released.shot?.velocityY).toBeLessThan(0)
    expect(released.shot?.velocityX).toBeCloseTo(0)
    expect(released.arrowVisible).toBe(false)
  })

  it('does not shoot from a short pull and requires a new two-finger gesture after firing', () => {
    const controller = new ArcheryController()
    const stringY = bowStringCenter(bowPose).y / 1000
    controller.update(input(0, arrowHand(stringY, false), true))
    controller.update(input(50, arrowHand(stringY, true), false))
    const cancelled = release(controller, input(100, arrowHand(stringY, false), false))
    expect(cancelled.phase).toBe('armed')
    expect(cancelled.shot).toBeNull()

    controller.update(input(250, arrowHand(stringY, true), false))
    controller.update(input(300, arrowHand(.72, true), false))
    release(controller, input(350, arrowHand(.72, false), false))
    expect(controller.update(input(500, arrowHand(stringY, false), false)).phase).toBe('idle')
    expect(controller.update(input(550, arrowHand(stringY, false), true)).phase).toBe('armed')
  })

  it('cancels the draw if the arrow hand remains missing', () => {
    const controller = new ArcheryController()
    const stringY = bowStringCenter(bowPose).y / 1000
    controller.update(input(0, arrowHand(stringY, false), true))
    controller.update(input(50, arrowHand(stringY, true), false))
    controller.update(input(100, arrowHand(.72, true), false))
    expect(controller.update(input(200, null, false)).phase).toBe('drawing')
    const lost = controller.update(input(500, null, false))
    expect(lost.phase).toBe('idle')
    expect(lost.shot).toBeNull()
  })

  it('does not fire if tracking resumes with the pinch already open', () => {
    const controller = new ArcheryController()
    const stringY = bowStringCenter(bowPose).y / 1000
    controller.update(input(0, arrowHand(stringY, false), true))
    controller.update(input(50, arrowHand(stringY, true), false))
    controller.update(input(100, arrowHand(.72, true), false))
    controller.update(input(150, null, false))
    const resumed = release(controller, input(200, arrowHand(.72, false), false))
    expect(resumed.phase).toBe('armed')
    expect(resumed.shot).toBeNull()
  })

  it('fires perpendicular to a rotated bow', () => {
    const controller = new ArcheryController()
    const sideBow = { ...bowPose, x: 400, y: 500, rotation: 0 }
    const string = bowStringCenter(sideBow)
    controller.update({ ...input(0, arrowHand(.5, false, string.x), true), bowPose: sideBow })
    const nocked = controller.update({ ...input(50, arrowHand(.5, true, string.x), false), bowPose: sideBow })
    expect(nocked.phase).toBe('nocked')
    expect(nocked.arrowPose?.rotation).toBeCloseTo(Math.PI / 2)
    controller.update({ ...input(100, arrowHand(.5, true, 720), false), bowPose: sideBow })
    const shot = release(controller, { ...input(150, arrowHand(.5, false, 720), false), bowPose: sideBow }).shot
    expect(shot?.velocityX).toBeLessThan(0)
    expect(shot?.velocityY).toBeCloseTo(0)
  })
})

describe('pinch release stability', () => {
  function drawingController() {
    const controller = new ArcheryController()
    controller.update(input(0, arrowHand(bowStringCenter(bowPose).y / 1000, false), true))
    controller.update(input(50, arrowHand(bowStringCenter(bowPose).y / 1000, true), false))
    controller.update(input(100, arrowHand(.72, true), false))
    return controller
  }

  it('holds through a brief open detection and resets release confirmation when pinched again', () => {
    const controller = drawingController()
    const held = controller.update(input(150, arrowHand(.72, false), false))
    expect(held.phase).toBe('drawing')
    expect(held.shot).toBeNull()
    controller.update(input(200, arrowHand(.72, true), false))
    expect(controller.update(input(250, arrowHand(.72, false), false)).phase).toBe('drawing')
    expect(controller.update(input(300, arrowHand(.72, false), false)).shot).toBeNull()
    expect(controller.update(input(350, arrowHand(.72, false), false)).shot).not.toBeNull()
    expect(controller.update(input(400, arrowHand(.72, false), false)).shot).toBeNull()
  })

  it('does not release from invalid landmarks and can resume pulling', () => {
    const controller = drawingController()
    const broken = arrowHand(.72, true)
    broken.landmarks[8].x = NaN
    expect(controller.update(input(150, broken, false)).phase).toBe('drawing')
    controller.update(input(200, arrowHand(.72, true), false))
    expect(release(controller, input(250, arrowHand(.72, false), false)).shot).not.toBeNull()
  })

  it('does not fire after tracking disappears during release confirmation', () => {
    const controller = drawingController()
    controller.update(input(150, arrowHand(.72, false), false))
    controller.update(input(200, null, false))
    const result = release(controller, input(250, arrowHand(.72, false), false))
    expect(result.shot).toBeNull()
    expect(result.phase).toBe('armed')
  })

  it('requires multiple observations even when frames are far apart', () => {
    const controller = drawingController()
    controller.update(input(150, arrowHand(.72, false), false))
    expect(controller.update(input(300, arrowHand(.72, false), false)).shot).toBeNull()
    expect(controller.update(input(350, arrowHand(.72, false), false)).shot).not.toBeNull()
  })
})
