import type { DetectedHand } from './handRoles'

function fiveFingersExtended(hand: DetectedHand): boolean {
  const points = hand.worldLandmarks
  if (!points || points.length < 21) return false
  const distance = (a: number, b: number) => Math.hypot(
    points[a].x - points[b].x,
    points[a].y - points[b].y,
    points[a].z - points[b].z,
  )
  const straightness = (mcp: number, pip: number, dip: number, tip: number) => {
    const path = distance(mcp, pip) + distance(pip, dip) + distance(dip, tip)
    return path > 0 ? distance(mcp, tip) / path : 0
  }
  return straightness(1, 2, 3, 4) > .78 &&
    straightness(5, 6, 7, 8) > .82 &&
    straightness(9, 10, 11, 12) > .82 &&
    straightness(13, 14, 15, 16) > .82 &&
    straightness(17, 18, 19, 20) > .82
}

/** Open five fingers to summon the bow, then keep holding it while gripping. */
export class FiveFingerGate {
  private candidateSince: number | null = null
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
    if (this.active) return true
    const open = (hand.gesture === 'Open_Palm' && hand.score >= .55) || fiveFingersExtended(hand)
    if (!open) {
      this.candidateSince = null
      return false
    }
    this.candidateSince ??= now
    if (now - this.candidateSince >= 150) this.active = true
    return this.active
  }

  reset() {
    this.candidateSince = null
    this.lostSince = null
    this.active = false
  }
}
