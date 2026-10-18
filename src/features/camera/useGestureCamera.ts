import { useCallback, useEffect, useRef, useState } from 'react'
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision'
import { inferenceIntervalMs } from '../../config/arConfig'
import type { VideoSize } from '../ar/handPose'
import { HandRoleAssigner, type DetectedHand, type HandRoles } from '../ar/handRoles'
import { FiveFingerGate } from '../ar/fiveFingerGate'
import { TwoFingerGate } from '../ar/twoFingerGate'

export type CameraStatus = 'idle' | 'requesting' | 'loading' | 'ready' | 'error'

export type HandTracking = HandRoles & {
  bowGestureActive: boolean
  arrowGestureActive: boolean
  video: VideoSize
}

const emptyTracking: HandTracking = {
  bow: null,
  arrow: null,
  bowGestureActive: false,
  arrowGestureActive: false,
  video: { width: 0, height: 0 },
}

function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Izin kamera ditolak. Izinkan kamera melalui pengaturan browser, lalu coba lagi.'
    }
    if (error.name === 'NotFoundError') return 'Kamera tidak ditemukan di perangkat ini.'
    if (error.name === 'NotReadableError') return 'Kamera sedang digunakan aplikasi lain atau tidak dapat dibaca.'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Akses kamera membutuhkan browser yang mendukung dan halaman HTTPS atau localhost.'
  }
  console.error('Kamera atau MediaPipe gagal dimulai:', error)
  return 'Kamera atau model tracking gagal dimuat. Periksa koneksi dan coba lagi.'
}

export function useGestureCamera() {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [tracking, setTracking] = useState<HandTracking>(emptyTracking)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const frameRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const statusRef = useRef<CameraStatus>('idle')
  const rolesRef = useRef(new HandRoleAssigner())
  const fiveFingerRef = useRef(new FiveFingerGate())
  const twoFingerRef = useRef(new TwoFingerGate())

  const changeStatus = useCallback((next: CameraStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const stop = useCallback(() => {
    generationRef.current += 1
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    recognizerRef.current?.close()
    recognizerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    rolesRef.current.reset()
    fiveFingerRef.current.reset()
    twoFingerRef.current.reset()
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    setTracking(emptyTracking)
    setError(null)
    changeStatus('idle')
  }, [changeStatus])

  useEffect(() => () => stop(), [stop])

  const start = useCallback(async () => {
    if (statusRef.current === 'requesting' || statusRef.current === 'loading' || statusRef.current === 'ready') return
    stop()
    const generation = generationRef.current
    changeStatus('requesting')

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MediaDevices unavailable')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
      })
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element unavailable')
      video.srcObject = stream
      await video.play()
      if (generation !== generationRef.current) return

      changeStatus('loading')
      const vision = await FilesetResolver.forVisionTasks('/mediapipe')
      if (generation !== generationRef.current) return
      const options = { runningMode: 'VIDEO' as const, numHands: 2 }
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: '/mediapipe/gesture_recognizer.task', delegate: 'GPU' },
      }).catch(() => GestureRecognizer.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: '/mediapipe/gesture_recognizer.task', delegate: 'CPU' },
      }))
      if (generation !== generationRef.current) {
        recognizer.close()
        return
      }
      recognizerRef.current = recognizer
      changeStatus('ready')

      let lastVideoTime = -1
      let lastInferenceAt = -Infinity
      const tick = () => {
        if (generation !== generationRef.current) return
        const now = performance.now()
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime && now - lastInferenceAt >= inferenceIntervalMs) {
          lastVideoTime = video.currentTime
          lastInferenceAt = now
          try {
            const result = recognizer.recognizeForVideo(video, now)
            const hands: DetectedHand[] = result.landmarks.map((landmarks, index) => {
              const category = result.gestures[index]?.[0]
              return {
                landmarks,
                worldLandmarks: result.worldLandmarks[index],
                handedness: result.handedness[index]?.[0]?.categoryName ?? null,
                handednessScore: result.handedness[index]?.[0]?.score ?? 0,
                gesture: category?.categoryName ?? null,
                score: category?.score ?? 0,
              }
            })
            const roles = rolesRef.current.update(hands, now)
            setTracking({
              ...roles,
              bowGestureActive: fiveFingerRef.current.update(roles.bow, now),
              arrowGestureActive: twoFingerRef.current.update(roles.arrow, now),
              video: { width: video.videoWidth, height: video.videoHeight },
            })
          } catch (cause) {
            console.error('Tracking tangan terhenti:', cause)
            stop()
            changeStatus('error')
            setError('Tracking tangan terhenti. Coba hidupkan kamera kembali.')
            return
          }
        }
        frameRef.current = requestAnimationFrame(tick)
      }
      frameRef.current = requestAnimationFrame(tick)
    } catch (cause) {
      if (generation !== generationRef.current) return
      const message = describeError(cause)
      stop()
      changeStatus('error')
      setError(message)
    }
  }, [stop, changeStatus])

  return { videoRef, status, error, tracking, start, stop }
}
