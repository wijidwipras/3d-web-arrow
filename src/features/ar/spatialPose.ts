import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { Euler, Quaternion, Vector3 } from 'three'
import type { BowPose, VideoSize, Viewport } from './handPose'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const valid = (point: Landmark | NormalizedLandmark | undefined) =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)

/** Camera facing coordinates: +X right on the mirrored video, +Y up, +Z toward the viewer. */
function relative(a: Landmark, b: Landmark) {
  return new Vector3(-(a.x - b.x), -(a.y - b.y), -(a.z - b.z))
}

export function orientation3D(
  world: readonly Landmark[] | undefined,
  rotation: number,
  kind: 'bow' | 'arrow',
  previous: Pick<BowPose, 'tiltX' | 'tiltY'> = { tiltX: 0, tiltY: 0 },
): Pick<BowPose, 'tiltX' | 'tiltY'> {
  if (!world || world.length < 18 || ![0, 5, 8, 9, 12, 17].every((i) => valid(world[i]))) {
    return previous
  }
  const wrist = world[0]
  const across = relative(world[5], world[17])
  const along = kind === 'bow'
    ? relative(world[9], wrist)
    : relative(world[8], world[5]).add(relative(world[12], world[9])).multiplyScalar(.5)
  if (across.length() < .01 || along.length() < .01) return previous
  const normal = new Vector3().crossVectors(across, relative(world[9], wrist)).normalize()
  // Normal direction can flip when the palm turns. Use the axis in camera space
  // and constrain the tilt so a brief noisy landmark cannot invert the model.
  const tiltX = clamp(Math.atan2(along.z, Math.hypot(along.x, along.y)), -.7, .7)
  const tiltY = clamp(Math.atan2(normal.x, Math.max(.35, Math.abs(normal.z))), -.55, .55)
  if (!Number.isFinite(tiltX + tiltY + rotation)) return previous
  return { tiltX, tiltY }
}

export function orientationQuaternion(pose: BowPose): Quaternion {
  return new Quaternion().setFromEuler(new Euler(pose.tiltX ?? 0, pose.tiltY ?? 0, pose.rotation, 'ZYX'))
}

export function bowAxis3D(pose: BowPose): Vector3 {
  return new Vector3(1, 0, 0).applyQuaternion(orientationQuaternion(pose)).normalize()
}

export function palmMeasure(landmarks: readonly NormalizedLandmark[], viewport: Viewport, video: VideoSize): number | null {
  if (landmarks.length < 18 || !video.width || !video.height) return null
  const scale = Math.max(viewport.width / video.width, viewport.height / video.height)
  const width = Math.hypot(
    (landmarks[5].x - landmarks[17].x) * video.width * scale,
    (landmarks[5].y - landmarks[17].y) * video.height * scale,
  )
  const length = Math.hypot(
    (landmarks[0].x - landmarks[9].x) * video.width * scale,
    (landmarks[0].y - landmarks[9].y) * video.height * scale,
  )
  const size = Math.max(width, length * .65)
  return Number.isFinite(size) && size >= 14 ? size : null
}

/** Depth is relative to a comfortable first pose. It cannot be absolute with one webcam. */
export class RelativeDepth {
  private baseline: number | null = null
  private current = 0

  update(measure: number | null, active: boolean): number {
    if (!active || measure === null) return this.current
    this.baseline ??= measure
    const ratio = clamp(measure / this.baseline, .65, 1.5)
    this.current = clamp((ratio - 1) * 350, -125, 175)
    return this.current
  }

  calibrate(measure: number | null) {
    this.baseline = measure
    this.current = 0
  }

  reset() {
    this.baseline = null
    this.current = 0
  }
}
