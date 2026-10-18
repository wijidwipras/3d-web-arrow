import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Group, Vector3 } from 'three'
import { arrowModelSrc, bowModelSrc, bowRig, maxRenderDpr } from '../config/arConfig'
import type { BowPose, Viewport } from '../features/ar/handPose'
import type { ArrowShot } from '../features/ar/archeryInteraction'

class ModelBoundary extends Component<{ children: ReactNode; resetKey: number; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('Busur 3D gagal dimuat:', error)
    this.props.onError()
  }
  componentDidUpdate(previous: Readonly<{ resetKey: number }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  render() { return this.state.failed ? null : this.props.children }
}

function BowString({ draw }: { draw: number }) {
  const lower = useRef<Group>(null)
  const upper = useRef<Group>(null)
  const target = useRef(draw)
  const current = useRef(0)
  useEffect(() => { target.current = draw }, [draw])

  useFrame((_, delta) => {
    current.current += (target.current - current.current) * (1 - Math.exp(-delta * (target.current > current.current ? 18 : 26)))
    const pull = current.current * bowRig.maxPull
    const halfSpan = bowRig.stringMiddleY - bowRig.stringBottomY
    const length = Math.hypot(pull, halfSpan)
    if (lower.current) {
      lower.current.position.set(bowRig.stringX + pull / 2, (bowRig.stringBottomY + bowRig.stringMiddleY) / 2, .005)
      lower.current.rotation.z = -Math.atan2(pull, halfSpan)
      lower.current.scale.y = length
    }
    if (upper.current) {
      upper.current.position.set(bowRig.stringX + pull / 2, (bowRig.stringMiddleY + bowRig.stringTopY) / 2, .005)
      upper.current.rotation.z = Math.atan2(pull, bowRig.stringTopY - bowRig.stringMiddleY)
      upper.current.scale.y = Math.hypot(pull, bowRig.stringTopY - bowRig.stringMiddleY)
    }
  })

  return <>
    <group ref={lower}><mesh><cylinderGeometry args={[.002, .002, 1, 6]} /><meshStandardMaterial color={`hsl(${180 - draw * 140}, 90%, 75%)`} emissive={`hsl(${180 - draw * 140}, 85%, 55%)`} emissiveIntensity={.8} /></mesh></group>
    <group ref={upper}><mesh><cylinderGeometry args={[.002, .002, 1, 6]} /><meshStandardMaterial color={`hsl(${180 - draw * 140}, 90%, 75%)`} emissive={`hsl(${180 - draw * 140}, 85%, 55%)`} emissiveIntensity={.8} /></mesh></group>
  </>
}

function TrackedAsset({ src, pose, viewport, enabled, depth, bowDraw }: { src: string; pose: BowPose | null; viewport: Viewport; enabled: boolean; depth: number; bowDraw?: number }) {
  const { scene } = useGLTF(src)
  const group = useRef<Group>(null)
  const target = useRef<BowPose | null>(pose)
  const lastSeen = useRef(0)
  const initialized = useRef(false)
  const normalized = useMemo(() => {
    const object = scene.clone(true)
    if (bowDraw !== undefined) object.traverse((part) => {
      if (part.name === 'IceBow_String') part.visible = false
    })
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    return { object, center, height: Math.max(size.y, .001) }
  }, [scene, bowDraw !== undefined])

  useEffect(() => {
    target.current = pose
    if (pose) lastSeen.current = performance.now()
  }, [pose])

  useFrame((_, delta) => {
    const asset = group.current
    if (!asset) return
    const next = target.current
    const shouldShow = enabled && (next !== null || performance.now() - lastSeen.current < 350)
    asset.visible = (shouldShow && initialized.current) || !!(enabled && next)
    if (!next || !enabled) return

    const x = next.x - viewport.width / 2
    const y = viewport.height / 2 - next.y
    const size = next.length / normalized.height
    if (!initialized.current) {
      asset.position.set(x, y, depth)
      asset.rotation.z = next.rotation
      asset.scale.setScalar(size)
      initialized.current = true
      return
    }

    const blend = 1 - Math.exp(-delta * 13)
    asset.position.x += (x - asset.position.x) * blend
    asset.position.y += (y - asset.position.y) * blend
    asset.scale.setScalar(asset.scale.x + (size - asset.scale.x) * blend)
    const angleDelta = Math.atan2(Math.sin(next.rotation - asset.rotation.z), Math.cos(next.rotation - asset.rotation.z))
    asset.rotation.z += angleDelta * blend
  })

  return <group ref={group} visible={false}>
    <group position={normalized.center.clone().multiplyScalar(-1)}>
      <primitive object={normalized.object} />
      {bowDraw !== undefined && <BowString draw={bowDraw} />}
    </group>
  </group>
}

function FlyingArrows({ shot, viewport, active }: { shot: ArrowShot | null; viewport: Viewport; active: boolean }) {
  const { scene } = useGLTF(arrowModelSrc)
  const layer = useRef<Group>(null)
  const lastShotId = useRef(0)
  const arrows = useRef<Array<{ node: Group; vx: number; vy: number; age: number }>>([])
  const normalized = useMemo(() => {
    const box = new Box3().setFromObject(scene)
    return { center: box.getCenter(new Vector3()), height: Math.max(box.getSize(new Vector3()).y, .001) }
  }, [scene])

  useEffect(() => {
    if (!active || !shot || shot.id <= lastShotId.current || !layer.current) return
    lastShotId.current = shot.id
    const node = new Group()
    const model = scene.clone(true)
    model.position.copy(normalized.center).multiplyScalar(-1)
    node.add(model)
    node.position.set(shot.pose.x - viewport.width / 2, viewport.height / 2 - shot.pose.y, 2)
    node.rotation.z = shot.pose.rotation
    node.scale.setScalar(shot.pose.length / normalized.height)
    layer.current.add(node)
    arrows.current.push({ node, vx: shot.velocityX, vy: shot.velocityY, age: 0 })
  }, [shot, viewport, scene, normalized, active])

  useEffect(() => {
    if (active) return
    for (const arrow of arrows.current) layer.current?.remove(arrow.node)
    arrows.current = []
  }, [active])

  useFrame((_, delta) => {
    const dt = Math.min(delta, .05)
    for (let index = arrows.current.length - 1; index >= 0; index--) {
      const arrow = arrows.current[index]
      arrow.age += dt
      arrow.node.position.x += arrow.vx * dt
      arrow.node.position.y -= arrow.vy * dt
      arrow.vy += 320 * dt
      arrow.node.rotation.z = Math.atan2(-arrow.vx, -arrow.vy)
      if (arrow.age > 3 || Math.abs(arrow.node.position.x) > viewport.width * 1.5 || Math.abs(arrow.node.position.y) > viewport.height * 1.5) {
        layer.current?.remove(arrow.node)
        arrows.current.splice(index, 1)
      }
    }
  })

  useEffect(() => () => {
    for (const arrow of arrows.current) layer.current?.remove(arrow.node)
    arrows.current = []
  }, [])

  return <group ref={layer} />
}

export default function ARViewer({ bowPose, arrowPose, viewport, showBow, showArrow, allowArrows, bowDraw, shot, retryKey, onError }: {
  bowPose: BowPose | null
  arrowPose: BowPose | null
  viewport: Viewport
  showBow: boolean
  showArrow: boolean
  allowArrows: boolean
  bowDraw: number
  shot: ArrowShot | null
  retryKey: number
  onError: () => void
}) {
  return <div className="ar-three-layer" aria-hidden="true">
    <ModelBoundary resetKey={retryKey} onError={onError}>
      <Canvas orthographic camera={{ position: [0, 0, 100], zoom: 1, near: .1, far: 500 }} gl={{ alpha: true, antialias: true }} dpr={[1, maxRenderDpr]}>
        <ambientLight intensity={1.8} />
        <hemisphereLight args={['#ebfdff', '#153647', 2.4]} />
        <directionalLight position={[3, 5, 8]} intensity={3} />
        <directionalLight position={[-4, 1, -2]} intensity={1.4} color="#80dff6" />
        <Suspense fallback={null}>
          <TrackedAsset src={bowModelSrc} pose={bowPose} viewport={viewport} enabled={showBow} depth={0} bowDraw={bowDraw} />
        </Suspense>
        <Suspense fallback={null}>
          <TrackedAsset src={arrowModelSrc} pose={arrowPose} viewport={viewport} enabled={showArrow} depth={1} />
          <FlyingArrows shot={shot} viewport={viewport} active={allowArrows} />
        </Suspense>
      </Canvas>
    </ModelBoundary>
  </div>
}
