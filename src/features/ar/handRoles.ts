import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'

export type DetectedHand = {
  landmarks: readonly NormalizedLandmark[]
  worldLandmarks?: readonly Landmark[]
  handedness: string | null
  gesture: string | null
  score: number
}

export type HandRoles = { bow: DetectedHand | null; arrow: DetectedHand | null }
type Wrist = { x: number; y: number }

const wristOf = (hand: DetectedHand): Wrist => ({ x: hand.landmarks[0].x, y: hand.landmarks[0].y })
const distanceTo = (hand: DetectedHand, wrist: Wrist) =>
  (hand.landmarks[0].x - wrist.x) ** 2 + (hand.landmarks[0].y - wrist.y) ** 2

/** Locks the first hand to the bow for the entire camera session. */
export class HandRoleAssigner {
  private bowSide: string | null = null
  private arrowSide: string | null = null
  private bowWrist: Wrist | null = null
  private arrowWrist: Wrist | null = null

  update(hands: readonly DetectedHand[]): HandRoles {
    if (hands.length === 0) return { bow: null, arrow: null }

    if (!this.bowWrist) {
      const bow = hands[0]
      const arrow = hands[1] ?? null
      this.remember(bow, arrow)
      return { bow, arrow }
    }

    if (hands.length === 1) {
      const hand = hands[0]
      const isArrow = this.isArrowWhenAlone(hand)
      const bow = isArrow ? null : hand
      const arrow = isArrow ? hand : null
      this.remember(bow, arrow)
      return { bow, arrow }
    }

    const bowMatches = this.bowSide
      ? hands.map((hand, index) => hand.handedness === this.bowSide ? index : -1).filter((index) => index >= 0)
      : []
    const arrowMatches = this.arrowSide
      ? hands.map((hand, index) => hand.handedness === this.arrowSide ? index : -1).filter((index) => index >= 0)
      : []
    let bowIndex: number
    if (bowMatches.length === 1) bowIndex = bowMatches[0]
    else if (arrowMatches.length === 1) bowIndex = arrowMatches[0] === 0 ? 1 : 0
    else bowIndex = distanceTo(hands[0], this.bowWrist) <= distanceTo(hands[1], this.bowWrist) ? 0 : 1

    // A turned hand can briefly receive the opposite handedness label. Keep the
    // tracked wrist when the position evidence is clearly stronger than that label.
    const otherIndex = bowIndex === 0 ? 1 : 0
    if (distanceTo(hands[bowIndex], this.bowWrist) - distanceTo(hands[otherIndex], this.bowWrist) > .04) {
      bowIndex = otherIndex
    }

    const bow = hands[bowIndex]
    const arrow = hands[bowIndex === 0 ? 1 : 0]
    this.remember(bow, arrow)
    return { bow, arrow }
  }

  private isArrowWhenAlone(hand: DetectedHand): boolean {
    if (this.arrowWrist && this.bowWrist) {
      const bowDistance = distanceTo(hand, this.bowWrist)
      const arrowDistance = distanceTo(hand, this.arrowWrist)
      if (Math.abs(bowDistance - arrowDistance) > .04) return arrowDistance < bowDistance
    }
    if (hand.handedness && this.bowSide && hand.handedness !== this.bowSide) return true
    if (hand.handedness && this.arrowSide && hand.handedness === this.arrowSide) return true
    if (!hand.handedness && this.arrowWrist && this.bowWrist) {
      return distanceTo(hand, this.arrowWrist) < distanceTo(hand, this.bowWrist)
    }
    return false
  }

  private remember(bow: DetectedHand | null, arrow: DetectedHand | null) {
    if (bow) {
      this.bowWrist = wristOf(bow)
      this.bowSide ??= bow.handedness
    }
    if (arrow) {
      this.arrowWrist = wristOf(arrow)
      this.arrowSide ??= arrow.handedness
    }
  }

  reset() {
    this.bowSide = null
    this.arrowSide = null
    this.bowWrist = null
    this.arrowWrist = null
  }
}
