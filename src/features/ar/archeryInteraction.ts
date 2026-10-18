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
  feedback: {
    bowPose: BowPose | null
    pinchPoint: { x: number; y: number } | null
    pinching: boolean
    nearString: boolean
    recovering: boolean
    canShoot: boolean
  } | null
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
const releaseConfirmMs = 100
const releaseMinSamples = 3
const maxDrawFraction = bowRig.maxPull / bowRig.modelHeight
const minShotFraction = .045
const nockRadiusFraction = .17

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function pinchOf(hand: DetectedHand, wasPinching: boolean, video: VideoSize): boolean | null {
  // Image landmarks provide independent evidence when inferred 3D depth jitters.
  // Correct image aspect ratio so rotation does not change the distance metric.
  const ratioOf = (points: DetectedHand['landmarks'], image: boolean): number | null => {
    if (points.length < 18) return null
    if (![0, 4, 8, 9, 5, 17].every((i) =>
      [points[i].x, points[i].y, ...(image ? [] : [points[i].z])].every(Number.isFinite))) return null
    const aspect = image && video.height > 0 ? video.width / video.height : 1
    const distance = (a: number, b: number) => Math.hypot(
      (points[a].x - points[b].x) * aspect,
      points[a].y - points[b].y,
      image ? 0 : points[a].z - points[b].z,
    )
    // Palm length remains useful when palm width foreshortens during a turn.
    const scale = Math.max(distance(5, 17), distance(0, 9) * .8)
    return scale >= .01 ? distance(4, 8) / scale : null
  }
  const imageRatio = ratioOf(hand.landmarks, true)
  if (imageRatio === null) return null
  const worldRatio = hand.worldLandmarks?.length
    ? ratioOf(hand.worldLandmarks, false) : null
  if (wasPinching) {
    // A latched pinch only opens on clear separation in both available views.
    // Disagreement retains the latch, rather than starting a release timer.
    return !(imageRatio > .8 && (worldRatio === null ? imageRatio > 1 : worldRatio > .85))
  }
  return imageRatio < .4 && (worldRatio === null ? imageRatio < .32 : worldRatio < .32)
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
  private releaseSince: number | null = null
  private releaseSamples = 0
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
      this.clearRelease()
      this.lostDuringDraw = false
    }

    let shot: ArrowShot | null = null
    if (this.phase === 'nocked' || this.phase === 'drawing') {
      if (!bow) {
        this.phase = handPresent ? 'armed' : 'idle'
        this.draw = 0
        this.pinching = false
        this.clearRelease()
        this.lostDuringDraw = false
      } else if (!input.bowPose) {
        this.clearRelease()
        this.lostDuringDraw = true
      } else if (arrowHand) {
        const pinching = pinchOf(arrowHand, this.pinching, video)
        if (pinching === null) {
          // Unknown geometry is tracking loss, never evidence of an open pinch.
          this.clearRelease()
          this.lostDuringDraw = true
        } else if (!pinching && this.pinching) {
          this.releaseSince ??= now
          this.releaseSamples += 1
          if (now - this.releaseSince >= releaseConfirmMs && this.releaseSamples >= releaseMinSamples) {
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
            this.pinching = false
            this.clearRelease()
          }
        } else if (pinching) {
          this.clearRelease()
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
      } else {
        this.clearRelease()
        this.lostDuringDraw = true
      }
    } else if (this.phase === 'armed' && bow && arrowHand && handArrowPose) {
      const pinching = pinchOf(arrowHand, this.pinching, video)
      this.pinching = pinching ?? this.pinching
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
      this.pinching = pinchOf(arrowHand, this.pinching, video) ?? this.pinching
    }

    const attached = (this.phase === 'nocked' || this.phase === 'drawing') && bow
    const arrowPose = attached ? attachedArrowPose(bow, this.draw, viewport) : handArrowPose
    const pinchValid = arrowHand ? pinchOf(arrowHand, this.pinching, video) !== null : false
    const thumb = pinchValid ? landmarkToViewport(arrowHand!.landmarks[4], viewport, video) : null
    const index = pinchValid ? landmarkToViewport(arrowHand!.landmarks[8], viewport, video) : null
    const pinchPoint = thumb && index ? { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 } : null
    const string = bow ? bowStringCenter(bow) : null
    return {
      feedback: {
        bowPose: bow,
        pinchPoint,
        pinching: this.pinching,
        nearString: !!(pinchPoint && string && bow && Math.hypot(pinchPoint.x - string.x, pinchPoint.y - string.y) <= bow.length * nockRadiusFraction),
        recovering: !!attached && (!input.bowPose || !pinchValid || this.lostDuringDraw),
        canShoot: !!attached && !this.lostDuringDraw && this.draw >= minShotFraction / maxDrawFraction,
      },
      phase: this.phase,
      draw: this.draw,
      arrowPose,
      arrowVisible: this.phase === 'armed' || !!attached,
      shot,
    }
  }

  private clearRelease() {
    this.releaseSince = null
    this.releaseSamples = 0
  }

  reset() {
    this.clearRelease()
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
