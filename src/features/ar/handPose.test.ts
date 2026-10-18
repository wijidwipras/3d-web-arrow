import { describe, expect, it } from 'vitest'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { computeArrowPose, computeBowPose, landmarkToViewport } from './handPose'

const point = (x: number, y: number): NormalizedLandmark => ({ x, y, z: 0, visibility: 1 })

describe('AR coordinate mapping', () => {
  it('mirrors the video and includes object-fit cover cropping', () => {
    const viewport = { width: 1000, height: 1000 }
    const video = { width: 1920, height: 1080 }
    expect(landmarkToViewport(point(.5, .5), viewport, video)).toEqual({ x: 500, y: 500 })
    expect(landmarkToViewport(point(0, .5), viewport, video).x).toBeCloseTo(1388.89, 1)
    expect(landmarkToViewport(point(1, .5), viewport, video).x).toBeCloseTo(-388.89, 1)
  })

  it('anchors a larger, horizontal bow to the palm', () => {
    const landmarks = Array.from({ length: 21 }, () => point(.5, .5))
    landmarks[0] = point(.5, .7)
    landmarks[5] = point(.6, .5)
    landmarks[9] = point(.5, .4)
    landmarks[17] = point(.4, .5)
    const pose = computeBowPose(landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 })
    expect(pose).not.toBeNull()
    expect(pose!.x).toBeCloseTo(500)
    expect(pose!.y).toBeCloseTo(514)
    expect(pose!.length).toBeCloseTo(2800)
    expect(pose!.rotation).toBeCloseTo(-Math.PI / 2)
  })

  it('keeps the bow sized when the palm turns edge-on', () => {
    const landmarks = Array.from({ length: 21 }, () => point(.5, .5))
    landmarks[0] = point(.5, .7)
    landmarks[5] = point(.5, .5)
    landmarks[9] = point(.505, .4)
    landmarks[17] = point(.51, .5)
    const pose = computeBowPose(landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 })
    expect(pose).not.toBeNull()
    expect(pose!.length).toBeGreaterThan(1000)
  })

  it('holds the bow angle when the palm direction points into the camera', () => {
    const landmarks = Array.from({ length: 21 }, () => point(.5, .5))
    landmarks[0] = point(.5, .5)
    landmarks[5] = point(.4, .5)
    landmarks[9] = point(.501, .5)
    landmarks[17] = point(.6, .5)
    const pose = computeBowPose(
      landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 }, undefined, -Math.PI / 2,
    )
    expect(pose?.rotation).toBeCloseTo(-Math.PI / 2)
  })

  it('points the arrow upward when both fingers point upward', () => {
    const landmarks = Array.from({ length: 21 }, () => point(.3, .5))
    landmarks[0] = point(.3, .7)
    landmarks[5] = point(.25, .5)
    landmarks[8] = point(.25, .1)
    landmarks[9] = point(.3, .4)
    landmarks[12] = point(.3, 0)
    landmarks[17] = point(.35, .5)
    const arrow = computeArrowPose(
      landmarks,
      { width: 1000, height: 1000 },
      { width: 1000, height: 1000 },
    )
    expect(arrow).not.toBeNull()
    expect(arrow!.x).toBeCloseTo(700)
    expect(arrow!.y).toBeCloseTo(514)
    expect(arrow!.rotation).toBeCloseTo(0)

    landmarks[8] = point(.15, .5)
    landmarks[12] = point(.2, .4)
    expect(computeArrowPose(landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 })?.rotation).toBeCloseTo(-Math.PI / 2)
  })

  it('keeps an arrow pose when the palm turns edge-on', () => {
    const landmarks = Array.from({ length: 21 }, () => point(.5, .5))
    landmarks[0] = point(.5, .7)
    landmarks[5] = point(.5, .5)
    landmarks[9] = point(.505, .4)
    landmarks[17] = point(.51, .5)
    landmarks[8] = point(.5, .15)
    landmarks[12] = point(.505, .05)

    const pose = computeArrowPose(landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 })
    expect(pose).not.toBeNull()
    expect(pose!.length).toBeGreaterThanOrEqual(210)
    expect(pose!.rotation).toBeCloseTo(0, 1)
  })

  it('continues the arrow angle through a full circle', () => {
    const landmarks = Array.from({ length: 21 }, () => point(.5, .5))
    landmarks[0] = point(.5, .7)
    landmarks[5] = point(.49, .5)
    landmarks[9] = point(.51, .5)
    landmarks[17] = point(.6, .5)
    let rotation: number | undefined
    const directions = [
      [.5, .3], [.3, .5], [.5, .7], [.7, .5], [.5, .3],
    ]
    const angles = directions.map(([x, y]) => {
      landmarks[8] = point(x - .01, y)
      landmarks[12] = point(x + .01, y)
      rotation = computeArrowPose(
        landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 }, rotation,
      )!.rotation
      return rotation
    })
    expect(angles[0]).toBeCloseTo(0)
    expect(angles[1]).toBeCloseTo(-Math.PI / 2)
    expect(angles[2]).toBeCloseTo(-Math.PI)
    expect(angles[3]).toBeCloseTo(-Math.PI * 1.5)
    expect(angles[4]).toBeCloseTo(-Math.PI * 2)

    landmarks[8] = point(.49, .5)
    landmarks[12] = point(.51, .5)
    expect(computeArrowPose(landmarks, { width: 1000, height: 1000 }, { width: 1000, height: 1000 }, rotation)?.rotation)
      .toBeCloseTo(-Math.PI * 2)
  })
})
