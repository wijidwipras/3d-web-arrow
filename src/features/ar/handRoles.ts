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
      // Overlapping wrists can make a single surviving detection impossible to
      // identify. Preserve both tracks until the camera separates them again.
      if (this.arrowWrist && Math.abs(
        distanceTo(hand, this.bowWrist) - distanceTo(hand, this.arrowWrist),
      ) < .0004) return { bow: null, arrow: null }
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

    // Match both wrists jointly. Handedness often flips during overlap and
    // must not override clear continuity, even when the hands are close.
    const firstCost = distanceTo(hands[0], this.bowWrist)
      + (this.arrowWrist ? distanceTo(hands[1], this.arrowWrist) : 0)
    const secondCost = distanceTo(hands[1], this.bowWrist)
      + (this.arrowWrist ? distanceTo(hands[0], this.arrowWrist) : 0)
    if (Math.abs(firstCost - secondCost) > .0004) {
      bowIndex = firstCost < secondCost ? 0 : 1
    } else if (this.arrowWrist) {
      // Do not overwrite remembered identities with an ambiguous assignment.
      return { bow: null, arrow: null }
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
      if (Math.abs(bowDistance - arrowDistance) > .0004) return arrowDistance < bowDistance
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
