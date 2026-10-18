import { useEffect, useRef } from 'react'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { maxRenderDpr } from '../config/arConfig'
import { HAND_CONNECTIONS, landmarkToViewport, type VideoSize, type Viewport } from '../features/ar/handPose'

export default function HandOverlay({ landmarks, viewport, video, visible }: {
  landmarks: { bow: readonly NormalizedLandmark[] | null; arrow: readonly NormalizedLandmark[] | null }
  viewport: Viewport
  video: VideoSize
  visible: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, maxRenderDpr)
    const width = Math.round(viewport.width * ratio)
    const height = Math.round(viewport.height * ratio)
    // Setting canvas dimensions reallocates its backing buffer and clears it.
    // Tracking updates many times per second, but the viewport rarely changes.
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, viewport.width, viewport.height)
    if (!visible) return

    const drawHand = (hand: readonly NormalizedLandmark[] | null, color: string, dot: string, fill: string) => {
      if (!hand?.length) return
      const points = hand.map((point) => landmarkToViewport(point, viewport, video))
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.shadowColor = color
      ctx.shadowBlur = 7
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath()
        ctx.moveTo(points[a].x, points[a].y)
        ctx.lineTo(points[b].x, points[b].y)
        ctx.stroke()
      }
      ctx.shadowBlur = 5
      points.forEach(({ x, y }, index) => {
        ctx.beginPath()
        ctx.arc(x, y, index === 0 || [4, 8, 12, 16, 20].includes(index) ? 5 : 3.5, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = dot
        ctx.lineWidth = index === 0 ? 2 : 1.5
        ctx.stroke()
      })
    }

    drawHand(landmarks.bow, '#000000', '#000000', '#000000')
    drawHand(landmarks.arrow, 'rgba(140, 85, 210, .95)', '#bd93f2', '#241039')
  }, [landmarks.bow, landmarks.arrow, video, viewport, visible])

  return <canvas ref={canvasRef} className="hand-overlay" aria-hidden="true" />
}
