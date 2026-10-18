import type { BowPose } from './handPose'

/** Suppress small stationary noise while responding quickly to deliberate motion. */
export class PoseStabilizer {
  private pose: BowPose | null = null
  private lastAt = -Infinity

  update(next: BowPose | null, now: number): BowPose | null {
    if (!next) return null
    if (!this.pose || now - this.lastAt > 350) {
      this.pose = { ...next }
      this.lastAt = now
      return { ...next }
    }
    const dt = Math.max(0, Math.min(.1, (now - this.lastAt) / 1000))
    this.lastAt = now
    const previous = this.pose
    const smooth = (from: number, to: number, deadband: number, fastAt: number, angle = false) => {
      const difference = angle ? Math.atan2(Math.sin(to - from), Math.cos(to - from)) : to - from
      const distance = Math.abs(difference)
      if (distance <= deadband) return from
      const rate = 5 + 23 * Math.min(1, (distance - deadband) / fastAt)
      return from + Math.sign(difference) * (distance - deadband) * (1 - Math.exp(-rate * dt))
    }
    this.pose = {
      ...next,
      x: smooth(previous.x, next.x, 2.5, 35),
      y: smooth(previous.y, next.y, 2.5, 35),
      length: smooth(previous.length, next.length, Math.max(5, previous.length * .008), 80),
      rotation: smooth(previous.rotation, next.rotation, .018, .2, true),
      depth: smooth(previous.depth ?? 0, next.depth ?? 0, 5, 65),
      tiltX: smooth(previous.tiltX ?? 0, next.tiltX ?? 0, .035, .25, true),
      tiltY: smooth(previous.tiltY ?? 0, next.tiltY ?? 0, .035, .25, true),
    }
    return { ...this.pose }
  }

  reset() { this.pose = null; this.lastAt = -Infinity }
}
