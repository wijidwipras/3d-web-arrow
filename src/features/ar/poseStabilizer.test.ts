import { expect, it } from 'vitest'
import { PoseStabilizer } from './poseStabilizer'

const pose = { x: 500, y: 400, length: 1000, rotation: 0, depth: 50, tiltX: .2, tiltY: -.1 }

it('holds small tracking noise without accumulating drift', () => {
  const filter = new PoseStabilizer()
  filter.update(pose, 0)
  for (let i = 1; i < 40; i++) {
    const sign = i % 2 ? 1 : -1
    expect(filter.update({
      ...pose, x: 500 + sign * 2, y: 400 + sign, length: 1000 + sign * 6,
      rotation: sign * .01, depth: 50 + sign * 4, tiltX: .2 + sign * .02,
    }, i * 50)).toEqual(pose)
  }
})

it('responds to deliberate motion and resets after tracking is lost', () => {
  const filter = new PoseStabilizer()
  filter.update(pose, 0)
  expect(filter.update({ ...pose, x: 600 }, 50)!.x).toBeGreaterThan(560)
  expect(filter.update(null, 100)).toBeNull()
  expect(filter.update({ ...pose, x: 700 }, 500)!.x).toBe(700)
})

it('takes the short path across a complete rotation', () => {
  const filter = new PoseStabilizer()
  filter.update({ ...pose, rotation: Math.PI - .02 }, 0)
  const next = filter.update({ ...pose, rotation: -Math.PI + .08 }, 50)!
  expect(Math.abs(next.rotation - Math.PI)).toBeLessThan(.1)
})
