import { describe, expect, it } from 'vitest'
import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { bowAxis3D, orientation3D, orientationQuaternion, palmMeasure, RelativeDepth } from './spatialPose'
import type { BowPose } from './handPose'

const point = (x: number, y: number, z = 0): Landmark => ({ x, y, z, visibility: 1 })
const palm = (depth = 0) => {
  const points = Array.from({ length: 21 }, () => point(0, 0))
  points[0] = point(0, .08)
  points[5] = point(-.04, 0)
  points[9] = point(0, -.02, depth)
  points[17] = point(.04, 0)
  points[8] = point(-.04, -.08, depth)
  points[12] = point(0, -.08, depth)
  return points
}
const pose: BowPose = { x: 500, y: 500, length: 800, rotation: 0, depth: 0, tiltX: 0, tiltY: 0 }

describe('spatial tracking', () => {
  it('uses a neutral pose when 3D landmarks are missing or invalid', () => {
    expect(orientation3D(undefined, 0, 'bow')).toEqual({ tiltX: 0, tiltY: 0 })
    const invalid = palm()
    invalid[9].z = NaN
    expect(orientation3D(invalid, 0, 'bow', { tiltX: .2, tiltY: -.1 }))
      .toEqual({ tiltX: .2, tiltY: -.1 })
  })

  it('tilts with the hand in depth and keeps a normalized bow axis', () => {
    const tilt = orientation3D(palm(.04), 0, 'bow')
    expect(Math.abs(tilt.tiltX ?? 0)).toBeGreaterThan(.1)
    const axis = bowAxis3D({ ...pose, ...tilt })
    expect(axis.length()).toBeCloseTo(1)
    expect(Number.isFinite(orientationQuaternion({ ...pose, ...tilt }).w)).toBe(true)
  })

  it('calibrates relative distance and limits extreme changes', () => {
    const depth = new RelativeDepth()
    expect(depth.update(100, true)).toBe(0)
    expect(depth.update(130, true)).toBeGreaterThan(0)
    expect(depth.update(50, true)).toBeCloseTo(-122.5)
    expect(depth.update(300, true)).toBe(175)
    depth.calibrate(130)
    expect(depth.update(130, true)).toBe(0)
    depth.reset()
    expect(depth.update(100, true)).toBe(0)
  })

  it('measures palm pixels independent of normalized camera dimensions', () => {
    const landmarks = palm().map((p) => ({ ...p, visibility: 1 })) as NormalizedLandmark[]
    expect(palmMeasure(landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 })).toBeGreaterThan(14)
  })
})
