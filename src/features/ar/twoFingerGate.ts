import type { DetectedHand } from './handRoles'

function twoFingersExtended(hand: DetectedHand): boolean {
  const points = hand.landmarks
  if (points.length < 21) return false
  const distance = (a: number, b: number) => Math.hypot(
    points[a].x - points[b].x,
    points[a].y - points[b].y,
    points[a].z - points[b].z,
  )
  const extended = (mcp: number, pip: number, tip: number) =>
    distance(mcp, tip) > distance(mcp, pip) * 1.7 &&
    distance(0, tip) > distance(0, pip) * 1.12
  const folded = (mcp: number, pip: number, tip: number) =>
    distance(mcp, tip) < distance(mcp, pip) * 1.6
  return extended(5, 6, 8) && extended(9, 10, 12) &&
    folded(13, 14, 16) && folded(17, 18, 20)
}

function fingerStraightnessIn3D(hand: DetectedHand, mcp: number, pip: number, dip: number, tip: number): number | null {
  const points = hand.worldLandmarks
  if (!points || points.length < 21) return null
  const distance = (a: number, b: number) => Math.hypot(
    points[a].x - points[b].x,
    points[a].y - points[b].y,
    points[a].z - points[b].z,
  )
  const path = distance(mcp, pip) + distance(pip, dip) + distance(dip, tip)
  return path > 0 ? distance(mcp, tip) / path : null
}

function twoFingersStraightIn3D(hand: DetectedHand): boolean {
  return (fingerStraightnessIn3D(hand, 5, 6, 7, 8) ?? 0) > .82 &&
    (fingerStraightnessIn3D(hand, 9, 10, 11, 12) ?? 0) > .82 &&
    (fingerStraightnessIn3D(hand, 13, 14, 15, 16) ?? 1) < .86 &&
    (fingerStraightnessIn3D(hand, 17, 18, 19, 20) ?? 1) < .86
}

function pointingFingersClearlyFolded(hand: DetectedHand): boolean {
  const index = fingerStraightnessIn3D(hand, 5, 6, 7, 8)
  const middle = fingerStraightnessIn3D(hand, 9, 10, 11, 12)
  return index !== null && middle !== null && index < .7 && middle < .7
}

/** Requires a short, confident two-finger pose before revealing the arrow. */
export class TwoFingerGate {
  private candidateSince: number | null = null
  private invalidSince: number | null = null
  private lostSince: number | null = null
  private active = false

  update(hand: DetectedHand | null, now: number): boolean {
    if (!hand) {
      this.lostSince ??= now
      if (this.active && now - this.lostSince < 350) return true
      this.reset()
      return false
    }

    this.lostSince = null
    const valid = (hand.gesture === 'Victory' && hand.score >= .65) ||
      twoFingersStraightIn3D(hand) || twoFingersExtended(hand)
    if (valid) {
      this.invalidSince = null
      if (!this.active) {
        this.candidateSince ??= now
        if (now - this.candidateSince >= 200) this.active = true
      }
    } else {
      this.candidateSince = null
      const clearlyDifferent = pointingFingersClearlyFolded(hand) ||
        (hand.score >= .7 && hand.gesture !== null && hand.gesture !== 'None' && hand.gesture !== 'Victory')
      if (this.active && clearlyDifferent) {
        this.invalidSince ??= now
        if (now - this.invalidSince >= 350) this.active = false
      } else {
        this.invalidSince = null
      }
    }
    return this.active
  }

  reset() {
    this.candidateSince = null
    this.invalidSince = null
    this.lostSince = null
    this.active = false
  }
}
