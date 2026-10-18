import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'

export type DetectedHand = {
  landmarks: readonly NormalizedLandmark[]
  worldLandmarks?: readonly Landmark[]
  handedness: string | null
  handednessScore?: number
  gesture: string | null
  score: number
}

export type HandRoles = { bow: DetectedHand | null; arrow: DetectedHand | null }
type Wrist = { x: number; y: number }

const wristOf = (hand: DetectedHand): Wrist => ({ x: hand.landmarks[0].x, y: hand.landmarks[0].y })
const distanceTo = (hand: DetectedHand, wrist: Wrist) =>
  (hand.landmarks[0].x - wrist.x) ** 2 + (hand.landmarks[0].y - wrist.y) ** 2

/** Initializes the bow on the left hand, then preserves identity by wrist continuity. */
export class HandRoleAssigner {
  private bowSide: string | null = null
  private arrowSide: string | null = null
  private bowWrist: Wrist | null = null
  private arrowWrist: Wrist | null = null

  private bowSeenAt = -Infinity
  private arrowSeenAt = -Infinity
  private overlapping = false
  private conflictSince: number | null = null
  private now = 0

  update(input: readonly DetectedHand[], now = performance.now()): HandRoles {
    this.now = now
    if (now - this.bowSeenAt > 500) this.bowWrist = null
    if (now - this.arrowSeenAt > 500) this.arrowWrist = null
    const hands = input.filter((hand) => hand.landmarks.length > 0)
    const confident = (hand: DetectedHand) => (hand.handednessScore ?? 1) >= .8
    const left = hands.filter((hand) => confident(hand) && hand.handedness === 'Left')
    const right = hands.filter((hand) => confident(hand) && hand.handedness === 'Right')
    const labelled = { bow: left.length === 1 ? left[0] : null, arrow: right.length === 1 ? right[0] : null }
    const finish = (bow: DetectedHand | null, arrow: DetectedHand | null): HandRoles => {
      // Brief label flips must not move assets, but persistent confident labels
      // must be able to correct a bad spatial match.
      const conflict = (labelled.bow && bow && labelled.bow !== bow) ||
        (labelled.arrow && arrow && labelled.arrow !== arrow) ||
        (bow && labelled.arrow === bow) || (arrow && labelled.bow === arrow)
      if (conflict && (hands.length === 1 || (labelled.bow && labelled.arrow))) this.conflictSince ??= now
      else this.conflictSince = null
      if (this.conflictSince !== null && now - this.conflictSince >= 200) {
        bow = labelled.bow
        arrow = labelled.arrow
        this.conflictSince = null
      }
      this.remember(bow, arrow)
      return { bow, arrow }
    }
    if (hands.length >= 2 && distanceTo(hands[0], wristOf(hands[1])) < .0004) {
      this.conflictSince = null
      this.overlapping = true
      return { bow: null, arrow: null }
    }
    if (this.overlapping) {
      if (hands.length < 2 && (this.bowWrist || this.arrowWrist)) return { bow: null, arrow: null }
      this.overlapping = false
      this.bowWrist = null
      this.arrowWrist = null
    }
    if (hands.length === 0) {
      this.conflictSince = null
      return { bow: null, arrow: null }
    }

    if (!this.bowWrist) {
      // Never use detection order to decide the initial bow hand.
      // Ambiguous labels wait for a clear reading instead of locking a guess.
      const bow = left.length === 1 ? left[0] : null
      const arrow = right.length === 1 ? right[0] : null
      return finish(bow, arrow)
    }

    if (hands.length === 1) {
      const hand = hands[0]
      // When spatial matching ties outside an overlap, use a confident label.
      if (this.arrowWrist && Math.abs(
        distanceTo(hand, this.bowWrist) - distanceTo(hand, this.arrowWrist),
      ) < .0004) return finish(labelled.bow, labelled.arrow)
      const isArrow = this.isArrowWhenAlone(hand)
      const bow = isArrow ? null : hand
      const arrow = isArrow ? hand : null
      return finish(bow, arrow)
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
      // Spatial ties outside an overlap can still have unambiguous labels.
      return finish(labelled.bow, labelled.arrow)
    }

    const bow = hands[bowIndex]
    const arrow = hands[bowIndex === 0 ? 1 : 0]
    return finish(bow, arrow)
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
      this.bowSeenAt = this.now
      this.bowWrist = wristOf(bow)
      this.bowSide ??= bow.handedness
    }
    if (arrow) {
      this.arrowSeenAt = this.now
      this.arrowWrist = wristOf(arrow)
      this.arrowSide ??= arrow.handedness
    }
  }

  reset() {
    this.bowSeenAt = -Infinity
    this.arrowSeenAt = -Infinity
    this.overlapping = false
    this.conflictSince = null
    this.bowSide = null
    this.arrowSide = null
    this.bowWrist = null
    this.arrowWrist = null
  }
}
