import type { DetectedHand } from './handRoles'
import { bowRig } from '../../config/arConfig'
import { landmarkToViewport, type ArrowPose, type BowPose, type VideoSize, type Viewport } from './handPose'

export type ArcheryPhase = 'idle' | 'armed' | 'nocked' | 'drawing' | 'flying'
export type ArrowShot = { id: number; pose: ArrowPose; velocityX: number; velocityY: number }
export type ArcherySnapshot = {
  phase: ArcheryPhase
  draw: number
  arrowPose: ArrowPose | null
  arrowVisible: boolean
  shot: ArrowShot | null
}

export type ArcheryInput = {
  bowPose: BowPose | null
  bowActive: boolean
  handArrowPose: ArrowPose | null
  arrowHand: DetectedHand | null
  arrowGestureActive: boolean
  viewport: Viewport
  video: VideoSize
  now: number
}

const trackingGraceMs = 350
const maxDrawFraction = bowRig.maxPull / bowRig.modelHeight
const minShotFraction = .045
const nockRadiusFraction = .17

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function pinchOf(hand: DetectedHand, wasPinching: boolean): boolean {
  const points = hand.worldLandmarks && hand.worldLandmarks.length >= 21 ? hand.worldLandmarks : hand.landmarks
  if (points.length < 18) return false
  const distance = (a: number, b: number) => Math.hypot(
    points[a].x - points[b].x,
    points[a].y - points[b].y,
    points[a].z - points[b].z,
  )
  const palmWidth = distance(5, 17)
  if (palmWidth < .01) return false
  const ratio = distance(4, 8) / palmWidth
  return ratio < (wasPinching ? .52 : .32)
}

/** Screen-space direction from the string toward the hand that pulls it. */
export function bowPullAxis(rotation: number) {
  return { x: Math.cos(rotation), y: -Math.sin(rotation) }
}

/** Position of the imported bow string's midpoint on the mirrored video. */
export function bowStringCenter(pose: BowPose) {
  const axis = bowPullAxis(pose.rotation)
  const offset = pose.length / bowRig.modelHeight * (bowRig.stringX - bowRig.modelCenterX)
  return { x: pose.x + axis.x * offset, y: pose.y + axis.y * offset }
}

function attachedArrowPose(bow: BowPose, draw: number, viewport: Viewport): ArrowPose {
  const axis = bowPullAxis(bow.rotation)
  const string = bowStringCenter(bow)
  const length = Math.min(bow.length * .67, viewport.width * 1.3)
  const nockX = string.x + axis.x * draw * maxDrawFraction * bow.length
  const nockY = string.y + axis.y * draw * maxDrawFraction * bow.length
  // The arrow's nock sits roughly half a model length behind its center.
  return {
    x: nockX - axis.x * length * .5,
    y: nockY - axis.y * length * .5,
    length,
    rotation: bow.rotation + Math.PI / 2,
  }
}

export class ArcheryController {
  private phase: ArcheryPhase = 'idle'
  private draw = 0
  private pinching = false
  private lostDuringDraw = false
  private wasArrowGestureActive = false
  private lastArrowHandAt = -Infinity
  private lastBowAt = -Infinity
  private lastBowPose: BowPose | null = null
  private lastShotAt = -Infinity
  private nextShotId = 1

  update(input: ArcheryInput): ArcherySnapshot {
    const { now, arrowHand, arrowGestureActive, bowActive, handArrowPose, viewport, video } = input
    if (input.bowPose && bowActive) {
      this.lastBowPose = input.bowPose
      this.lastBowAt = now
    }
    if (arrowHand) this.lastArrowHandAt = now
    const bow = bowActive && now - this.lastBowAt < trackingGraceMs ? this.lastBowPose : null
    const handPresent = !!arrowHand || now - this.lastArrowHandAt < trackingGraceMs
    const gestureStarted = arrowGestureActive && !this.wasArrowGestureActive
    this.wasArrowGestureActive = arrowGestureActive

    if (this.phase === 'flying' && !arrowGestureActive) this.phase = 'idle'
    if (this.phase === 'flying' && now - this.lastShotAt >= 500 &&
      arrowGestureActive && arrowHand?.gesture === 'Victory' && arrowHand.score >= .65) this.phase = 'armed'
    if (gestureStarted && (this.phase === 'idle' || this.phase === 'flying')) this.phase = 'armed'
    if (!handPresent && this.phase !== 'flying') {
      this.phase = 'idle'
      this.draw = 0
      this.pinching = false
      this.lostDuringDraw = false
    }

    let shot: ArrowShot | null = null
    if (this.phase === 'nocked' || this.phase === 'drawing') {
      if (!bow) {
        this.phase = handPresent ? 'armed' : 'idle'
        this.draw = 0
        this.lostDuringDraw = false
      } else if (arrowHand) {
        const pinching = pinchOf(arrowHand, this.pinching)
        if (!pinching && this.pinching) {
          if (!this.lostDuringDraw && this.draw >= minShotFraction / maxDrawFraction) {
            const pose = attachedArrowPose(bow, this.draw, viewport)
            const axis = bowPullAxis(bow.rotation)
            const speed = (600 + this.draw * 1500) * Math.max(.7, viewport.width / 1000)
            shot = {
              id: this.nextShotId++, pose,
              velocityX: -axis.x * speed,
              velocityY: -axis.y * speed,
            }
            this.lastShotAt = now
            this.phase = 'flying'
          } else {
            this.phase = 'armed'
          }
          this.draw = 0
          this.lostDuringDraw = false
        } else if (pinching) {
          this.lostDuringDraw = false
          const thumb = landmarkToViewport(arrowHand.landmarks[4], viewport, video)
          const index = landmarkToViewport(arrowHand.landmarks[8], viewport, video)
          const fingers = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }
          const string = bowStringCenter(bow)
          const axis = bowPullAxis(bow.rotation)
          const distance = (fingers.x - string.x) * axis.x + (fingers.y - string.y) * axis.y
          this.draw = clamp(distance / (maxDrawFraction * bow.length), 0, 1)
          this.phase = this.draw >= minShotFraction / maxDrawFraction ? 'drawing' : 'nocked'
        }
        this.pinching = pinching
      } else {
        this.lostDuringDraw = true
      }
    } else if (this.phase === 'armed' && bow && arrowHand && handArrowPose) {
      const pinching = pinchOf(arrowHand, this.pinching)
      this.pinching = pinching
      if (pinching) {
        const thumb = landmarkToViewport(arrowHand.landmarks[4], viewport, video)
        const index = landmarkToViewport(arrowHand.landmarks[8], viewport, video)
        const string = bowStringCenter(bow)
        if (Math.hypot((thumb.x + index.x) / 2 - string.x, (thumb.y + index.y) / 2 - string.y) <= bow.length * nockRadiusFraction) {
          this.phase = 'nocked'
          this.draw = 0
          this.lostDuringDraw = false
        }
      }
    } else if (arrowHand) {
      this.pinching = pinchOf(arrowHand, this.pinching)
    }

    const attached = (this.phase === 'nocked' || this.phase === 'drawing') && bow
    const arrowPose = attached ? attachedArrowPose(bow, this.draw, viewport) : handArrowPose
    return {
      phase: this.phase,
      draw: this.draw,
      arrowPose,
      arrowVisible: this.phase === 'armed' || !!attached,
      shot,
    }
  }

  reset() {
    this.phase = 'idle'
    this.draw = 0
    this.pinching = false
    this.lostDuringDraw = false
    this.wasArrowGestureActive = false
    this.lastArrowHandAt = -Infinity
    this.lastBowAt = -Infinity
    this.lastBowPose = null
    this.lastShotAt = -Infinity
  }
}
