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

describe('archery guidance and recovery', () => {
  it('reports proximity, attachment, power and resumes after a short bow occlusion', () => {
    const controller = new ArcheryController()
    const y = bowStringCenter(bowPose).y / 1000
    const nearby = controller.update(input(0, arrowHand(y, false), true))
    expect(nearby.feedback?.nearString).toBe(true)
    expect(nearby.feedback?.pinching).toBe(false)
    const nocked = controller.update(input(50, arrowHand(y, true), false))
    expect(nocked.feedback?.pinching).toBe(true)
    expect(nocked.feedback?.canShoot).toBe(false)
    const drawn = controller.update(input(100, arrowHand(.72, true), false))
    expect(drawn.feedback?.canShoot).toBe(true)
    const held = controller.update({ ...input(150, arrowHand(.72, true), false), bowPose: null })
    expect(held.feedback?.recovering).toBe(true)
    expect(held.feedback?.canShoot).toBe(false)
    expect(held.feedback?.bowPose).toEqual(bowPose)
    expect(held.draw).toBe(drawn.draw)
    expect(held.arrowPose).toEqual(drawn.arrowPose)
    const resumed = controller.update(input(200, arrowHand(.72, true), false))
    expect(resumed.feedback?.recovering).toBe(false)
    expect(resumed.phase).toBe('drawing')
    expect(release(controller, input(250, arrowHand(.72, false), false)).shot).not.toBeNull()
  })

  it('does not fire from an open pinch while the bow is occluded', () => {
    const controller = new ArcheryController()
    const y = bowStringCenter(bowPose).y / 1000
    controller.update(input(0, arrowHand(y, false), true))
    controller.update(input(50, arrowHand(y, true), false))
    controller.update(input(100, arrowHand(.72, true), false))
    const held = release(controller, { ...input(150, arrowHand(.72, false), false), bowPose: null })
    expect(held.shot).toBeNull()
    expect(held.phase).toBe('drawing')
    const resumedOpen = release(controller, input(300, arrowHand(.72, false), false))
    expect(resumedOpen.shot).toBeNull()
    expect(resumedOpen.phase).toBe('armed')
  })
})

describe('release evidence while pulling', () => {
  function start() {
    const controller = new ArcheryController()
    const y = bowStringCenter(bowPose).y / 1000
    controller.update(input(0, arrowHand(y, false), true))
    controller.update(input(50, arrowHand(y, true), false))
    return controller
  }

  it('holds at partial and full power when 3D tips drift but visible fingertips stay together', () => {
    const controller = start()
    for (let now = 100; now <= 1000; now += 50) {
      const y = now < 600 ? .72 : .95
      const held = arrowHand(y, true)
      held.worldLandmarks = arrowHand(y, false).landmarks
      const state = controller.update(input(now, held, false))
      expect(state.phase).toBe('drawing')
      expect(state.shot).toBeNull()
      expect(state.feedback?.pinching).toBe(true)
      expect(state.draw).toBeGreaterThan(.5)
    }
    const opened = arrowHand(.95, false)
    opened.worldLandmarks = opened.landmarks
    expect(release(controller, input(1050, opened, false)).shot).not.toBeNull()
  })

  it('holds through moderate sustained separation noise in image-only tracking', () => {
    const controller = start()
    const noisy = arrowHand(.72, true)
    noisy.landmarks[4].x -= .035
    noisy.landmarks[8].x += .035
    for (let now = 100; now <= 600; now += 50) {
      const state = controller.update(input(now, noisy, false))
      expect(state.shot).toBeNull()
      expect(state.phase).toBe('drawing')
    }
    expect(release(controller, input(650, arrowHand(.72, false), false)).shot).not.toBeNull()
  })

  it('holds when image tips drift apart but 3D still reports a closed pinch', () => {
    const controller = start()
    const uncertain = arrowHand(.72, false)
    uncertain.worldLandmarks = arrowHand(.72, true).landmarks
    const state = release(controller, input(100, uncertain, false))
    expect(state.shot).toBeNull()
    expect(state.phase).toBe('drawing')
  })
})

describe('3D archery', () => {
  it('keeps arrow depth attached and launches along the rotated bow axis', () => {
    const controller = new ArcheryController()
    const spatialBow = { ...bowPose, depth: 80, tiltY: .35, tiltX: .2 }
    const y = bowStringCenter(spatialBow).y / 1000
    const frame = (now: number, hand: DetectedHand, gesture: boolean) => ({
      ...input(now, hand, gesture), bowPose: spatialBow,
      handArrowPose: { ...handArrowPose, depth: 80 },
    })
    controller.update(frame(0, arrowHand(y, false), true))
    const nocked = controller.update(frame(50, arrowHand(y, true), false))
    expect(nocked.phase).toBe('nocked')
    expect(nocked.arrowPose?.quaternion).toHaveLength(4)
    const drawn = controller.update(frame(100, arrowHand(.8, true), false))
    expect(drawn.draw).toBeGreaterThan(0)
    const shot = release(controller, frame(150, arrowHand(.8, false), false)).shot
    expect(shot).not.toBeNull()
    expect(shot!.velocityZ).not.toBe(0)
    expect(shot!.pose.depth).not.toBe(0)
  })

  it('does not fire after a brief hand tracking loss in 3D', () => {
    const controller = new ArcheryController()
    const spatialBow = { ...bowPose, depth: 50, tiltX: .25 }
    const y = bowStringCenter(spatialBow).y / 1000
    const withBow = (now: number, hand: DetectedHand | null, gesture: boolean) =>
      ({ ...input(now, hand, gesture), bowPose: spatialBow, handArrowPose: { ...handArrowPose, depth: 50 } })
    controller.update(withBow(0, arrowHand(y, false), true))
    controller.update(withBow(50, arrowHand(y, true), false))
    controller.update(withBow(100, arrowHand(.72, true), false))
    controller.update(withBow(150, null, false))
    expect(release(controller, withBow(200, arrowHand(.72, false), false)).shot).toBeNull()
  })
})

it('locks depth, tilt and scale while aiming, ignores arrow depth, then unlocks', () => {
  const controller = new ArcheryController()
  const locked = { ...bowPose, depth: 50, tiltX: .2, tiltY: .25 }
  const y = bowStringCenter(locked).y / 1000
  const frame = (now: number, hand: DetectedHand, gesture: boolean, noisy = false) => ({
    ...input(now, hand, gesture),
    bowPose: noisy ? { ...locked, depth: -120, tiltX: -.6, tiltY: -.5, length: 1300 } : locked,
    handArrowPose: { ...handArrowPose, depth: noisy ? 175 : 50 },
  })
  controller.update(frame(0, arrowHand(y, false), true))
  controller.update(frame(50, arrowHand(y, true), false))
  const drawing = controller.update(frame(100, arrowHand(.72, true), false))
  const noisy = controller.update(frame(150, arrowHand(.72, true), false, true))
  expect(noisy.feedback?.bowPose).toEqual(locked)
  expect(noisy.draw).toBe(drawing.draw)
  expect(noisy.arrowPose).toEqual(drawing.arrowPose)
  expect(noisy.shot).toBeNull()
  const moved = controller.update({ ...frame(200, arrowHand(.72, true), false, true),
    bowPose: { ...locked, x: locked.x + 20, depth: -120 } })
  expect(moved.feedback?.bowPose?.x).toBe(locked.x + 20)
  const released = release(controller, frame(250, arrowHand(.72, false), false, true))
  expect(released.shot).not.toBeNull()
  const free = controller.update(frame(450, arrowHand(.72, false), false, true))
  expect(free.feedback?.bowPose?.depth).toBe(-120)
})

describe('screen-space nocking after stabilization', () => {
  it('accepts a pinch on the visible string despite disagreement in hand depths', () => {
    const controller = new ArcheryController()
    const bow = { ...bowPose, depth: -120, tiltX: .2, tiltY: .3 }
    const y = bowStringCenter(bow).y / 1000
    const frame = (now: number, pinching: boolean) => ({
      ...input(now, arrowHand(y, pinching), !pinching),
      bowPose: bow,
      handArrowPose: { ...handArrowPose, depth: 175 },
    })
    const prepared = controller.update(frame(0, false))
    expect(prepared.feedback?.nearString).toBe(true)
    const attached = controller.update(frame(50, true))
    expect(attached.phase).toBe('nocked')
    expect(attached.shot).toBeNull()
    const held = controller.update({ ...frame(100, true), bowPose: { ...bow, depth: 150 } })
    expect(held.feedback?.bowPose?.depth).toBe(-120)
  })

  it('still requires the pinch to be close to the visible string', () => {
    const controller = new ArcheryController()
    controller.update(input(0, arrowHand(.1, false), true))
    const far = controller.update(input(50, arrowHand(.1, true), false))
    expect(far.phase).toBe('armed')
    expect(far.feedback?.nearString).toBe(false)
  })

  it('can attach from valid pinch landmarks without a free-arrow pose', () => {
    const controller = new ArcheryController()
    const y = bowStringCenter(bowPose).y / 1000
    controller.update(input(0, arrowHand(y, false), true))
    expect(controller.update({
      ...input(50, arrowHand(y, true), false), handArrowPose: null,
    }).phase).toBe('nocked')
  })
})
