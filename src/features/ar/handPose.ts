import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type Viewport = { width: number; height: number }
export type VideoSize = { width: number; height: number }
export type Point = { x: number; y: number }
export type Calibration = { offsetX: number; offsetY: number; scale: number; rotation: number }
export type BowPose = { x: number; y: number; length: number; rotation: number; depth?: number; tiltX?: number; tiltY?: number; quaternion?: readonly [number, number, number, number] }
export type ArrowPose = BowPose

export const defaultCalibration: Calibration = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
}

/** Match a mirrored <video style="object-fit: cover"> pixel for pixel. */
export function landmarkToViewport(
  landmark: Pick<NormalizedLandmark, 'x' | 'y'>,
  viewport: Viewport,
  video: VideoSize,
): Point {
  if (!video.width || !video.height || !viewport.width || !viewport.height) return { x: 0, y: 0 }
  const coverScale = Math.max(viewport.width / video.width, viewport.height / video.height)
  const renderedWidth = video.width * coverScale
  const renderedHeight = video.height * coverScale
  const cropX = (viewport.width - renderedWidth) / 2
  const cropY = (viewport.height - renderedHeight) / 2
  return {
    x: cropX + (1 - landmark.x) * renderedWidth,
    y: cropY + landmark.y * renderedHeight,
  }
}

export function computeBowPose(
  landmarks: readonly NormalizedLandmark[],
  viewport: Viewport,
  video: VideoSize,
  calibration: Calibration = defaultCalibration,
  previousRotation?: number,
): BowPose | null {
  if (landmarks.length < 18 || !video.width || !video.height) return null
  const wrist = landmarkToViewport(landmarks[0], viewport, video)
  const indexBase = landmarkToViewport(landmarks[5], viewport, video)
  const middleBase = landmarkToViewport(landmarks[9], viewport, video)
  const pinkyBase = landmarkToViewport(landmarks[17], viewport, video)
  const palmWidth = Math.hypot(indexBase.x - pinkyBase.x, indexBase.y - pinkyBase.y)
  const palmLength = Math.hypot(middleBase.x - wrist.x, middleBase.y - wrist.y)
  if (palmWidth < 14 && palmLength < 14) return null
  const apparentPalmWidth = Math.max(palmWidth, palmLength * .65)

  // The model's grip is around its vertical midpoint. Place that point within the palm.
  const anchorX = wrist.x + (middleBase.x - wrist.x) * .62
  const anchorY = wrist.y + (middleBase.y - wrist.y) * .62
  const upX = middleBase.x - wrist.x
  const upY = wrist.y - middleBase.y
  // The Blender asset's long axis is +Y. A quarter turn makes it cross the palm horizontally.
  const bowRotation = Math.atan2(-upX, upY) - Math.PI / 2
  const measuredRotation = bowRotation + calibration.rotation * Math.PI / 180
  const rotation = palmLength < 14 && previousRotation !== undefined
    ? previousRotation
    : previousRotation !== undefined
      ? previousRotation + Math.atan2(
        Math.sin(measuredRotation - previousRotation),
        Math.cos(measuredRotation - previousRotation),
      )
      : measuredRotation
  const desiredLength = Math.min(
    Math.max(apparentPalmWidth * 14 * calibration.scale, 448),
    viewport.width * 2.8,
  )

  return {
    x: anchorX + calibration.offsetX * palmWidth,
    y: anchorY + calibration.offsetY * palmWidth,
    length: desiredLength,
    rotation,
  }
}

export function computeArrowPose(
  landmarks: readonly NormalizedLandmark[],
  viewport: Viewport,
  video: VideoSize,
  previousRotation?: number,
): ArrowPose | null {
  if (landmarks.length < 18 || !video.width || !video.height) return null
  const wrist = landmarkToViewport(landmarks[0], viewport, video)
  const indexBase = landmarkToViewport(landmarks[5], viewport, video)
  const middleBase = landmarkToViewport(landmarks[9], viewport, video)
  const pinkyBase = landmarkToViewport(landmarks[17], viewport, video)
  const indexTip = landmarkToViewport(landmarks[8], viewport, video)
  const middleTip = landmarkToViewport(landmarks[12], viewport, video)
  const palmWidth = Math.hypot(indexBase.x - pinkyBase.x, indexBase.y - pinkyBase.y)
  const palmLength = Math.hypot(middleBase.x - wrist.x, middleBase.y - wrist.y)
  const apparentPalmSize = Math.max(palmWidth, palmLength * .65, 18)

  const x = wrist.x + (middleBase.x - wrist.x) * .62
  const y = wrist.y + (middleBase.y - wrist.y) * .62
  // The arrow asset points along +Y. Aim its tip along the two extended fingers.
  const baseX = (indexBase.x + middleBase.x) / 2
  const baseY = (indexBase.y + middleBase.y) / 2
  const tipX = (indexTip.x + middleTip.x) / 2
  const tipY = (indexTip.y + middleTip.y) / 2
  const fingerLength = Math.hypot(tipX - baseX, tipY - baseY)
  // When one finger overlaps the other or points into the camera, use the
  // clearer finger instead of letting the averaged direction collapse.
  const indexLength = Math.hypot(indexTip.x - indexBase.x, indexTip.y - indexBase.y)
  const middleLength = Math.hypot(middleTip.x - middleBase.x, middleTip.y - middleBase.y)
  const direction = fingerLength >= 12
    ? { x: tipX - baseX, y: tipY - baseY }
    : Math.max(indexLength, middleLength) >= 12
      ? indexLength >= middleLength
        ? { x: indexTip.x - indexBase.x, y: indexTip.y - indexBase.y }
        : { x: middleTip.x - middleBase.x, y: middleTip.y - middleBase.y }
      : null
  const measuredRotation = direction
    ? Math.atan2(-direction.x, -direction.y)
    : Math.atan2(wrist.x - middleBase.x, wrist.y - middleBase.y)
  const rotation = direction && previousRotation !== undefined
    ? previousRotation + Math.atan2(
      Math.sin(measuredRotation - previousRotation),
      Math.cos(measuredRotation - previousRotation),
    )
    : !direction && previousRotation !== undefined ? previousRotation : measuredRotation
  return {
    x,
    y,
    length: Math.min(Math.max(apparentPalmSize * 6.2, 210), viewport.width * 1.3),
    rotation,
  }
}

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]
