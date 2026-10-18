import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { NormalBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Matrix4, Mesh, Vector3 } from 'three'
import type { Group } from 'three'

const sliceCount = 40

/** Slow ice streams following the model: grip to bow tips, or arrow nock to tip. */
export default function IceParticles({ model, height, power, enabled, kind }: {
  model: Group; height: number; power: number; enabled: boolean; kind: 'bow' | 'arrow'
}) {
  const particleCount = kind === 'bow' ? 96 : 64
  const reduced = useRef(false)
  const elapsed = useRef(0)
  const point = useMemo(() => new Vector3(), [])
  const uniforms = useMemo(() => ({ power: { value: 0 }, pixelRatio: { value: 1 } }), [])
  const paths = useMemo(() => {
    model.updateWorldMatrix(true, true)
    const parentInverse = model.parent ? model.parent.matrixWorld.clone().invert() : new Matrix4()
    const vertices: Vector3[] = []
    model.traverse((node) => {
      if (!(node instanceof Mesh) || !node.visible || node.name === 'IceBow_String') return
      const transform = new Matrix4().multiplyMatrices(parentInverse, node.matrixWorld)
      const positions = node.geometry.getAttribute('position')
      const indices = node.geometry.getIndex()
      const used = indices ? new Set(Array.from(indices.array)) : null
      for (let i = 0; i < positions.count; i++) {
        if (!used || used.has(i)) vertices.push(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform))
      }
    })
    if (!vertices.length) return null
    let minY = Infinity, maxY = -Infinity, frontZ = -Infinity
    for (const v of vertices) {
      minY = Math.min(minY, v.y)
      maxY = Math.max(maxY, v.y)
      frontZ = Math.max(frontZ, v.z)
    }
    const span = Math.max(maxY - minY, .001)
    const slices = Array.from({ length: sliceCount }, () => ({ min: Infinity, max: -Infinity }))
    for (const v of vertices) {
      const index = Math.min(sliceCount - 1, Math.floor((v.y - minY) / span * sliceCount))
      slices[index].min = Math.min(slices[index].min, v.x)
      slices[index].max = Math.max(slices[index].max, v.x)
    }
    const centers = slices.flatMap((slice, i) => Number.isFinite(slice.min)
      ? [new Vector3((slice.min + slice.max) / 2, minY + (i + .5) / sliceCount * span, frontZ + height * .008)] : [])
    if (centers.length < 2) return null
    const silhouette = new CatmullRomCurve3(centers)
    if (kind === 'arrow') return [silhouette]
    const middle = silhouette.getPoint(.5)
    const lower = [middle.clone()]
    const upper = [middle.clone()]
    for (let i = 1; i <= 24; i++) {
      lower.push(silhouette.getPoint(.5 - i / 48))
      upper.push(silhouette.getPoint(.5 + i / 48))
    }
    return [new CatmullRomCurve3(lower), new CatmullRomCurve3(upper)]
  }, [model, height, kind])
  const particles = useMemo(() => {
    const seeds = new Float32Array(particleCount)
    for (let i = 0; i < particleCount; i++) seeds[i] = ((kind === 'bow' ? Math.floor(i / 2) : i) * .61803398875) % 1
    return new BufferGeometry()
      .setAttribute('position', new BufferAttribute(new Float32Array(particleCount * 3), 3))
      .setAttribute('fade', new BufferAttribute(new Float32Array(particleCount), 1))
      .setAttribute('seed', new BufferAttribute(seeds, 1))
  }, [particleCount, kind])
  useEffect(() => () => particles.dispose(), [particles])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { reduced.current = media.matches }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  useEffect(() => { if (enabled) elapsed.current = 0 }, [enabled])
  useFrame((state, delta) => {
    if (!enabled || !paths) return
    const dt = Math.min(delta, .05)
    if (!reduced.current) elapsed.current += dt
    uniforms.power.value += (power - uniforms.power.value) * (1 - Math.exp(-dt * 8))
    uniforms.pixelRatio.value = state.gl.getPixelRatio()
    const positions = particles.getAttribute('position')
    const fades = particles.getAttribute('fade')
    const seeds = particles.getAttribute('seed')
    for (let i = 0; i < particleCount; i++) {
      const seed = seeds.getX(i)
      // A complete trip takes 5–7 seconds. Fade out before recycling at the grip.
      const life = (seed + elapsed.current / (5 + seed * 2)) % 1
      paths[i % paths.length].getPointAt(life, point)
      const drift = Math.sin(elapsed.current * .7 + i * 2.4) * height * .006
      point.x += Math.sin(i * 12.3) * height * .018 + drift
      point.y += Math.cos(i * 7.1) * height * .006
      positions.setXYZ(i, point.x, point.y, point.z)
      const fadeIn = Math.min(1, life / .12)
      const fadeOut = Math.min(1, (1 - life) / .2)
      fades.setX(i, fadeIn * fadeOut * (reduced.current ? 1 : Math.min(1, elapsed.current / .6)))
    }
    positions.needsUpdate = true
    fades.needsUpdate = true
  })
  if (!paths) return null
  return <points geometry={particles} renderOrder={3} frustumCulled={false}>
    <shaderMaterial transparent depthWrite={false} blending={NormalBlending} toneMapped={false} uniforms={uniforms}
      vertexShader={`
        attribute float seed, fade;
        uniform float power, pixelRatio;
        varying float opacity, crystal;
        void main() {
          opacity = fade; crystal = seed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
          gl_PointSize = (4. + seed * 7.) * pixelRatio * (1. + power * .15);
        }`}
      fragmentShader={`
        varying float opacity, crystal;
        void main() {
          vec2 p = gl_PointCoord - .5;
          float angle = crystal * 6.28318;
          p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
          float diamond = abs(p.x) * 1.3 + abs(p.y) * .8;
          float ice = 1. - smoothstep(.17, .25, diamond);
          float halo = exp(-dot(p,p) * 22.) * .22;
          float edge = smoothstep(.10, .23, diamond);
          vec3 core = mix(vec3(.025,.008,.055), vec3(.12,.035,.20), step(0.,p.x));
          vec3 tint = mix(core, vec3(.48,.18,.72), max(edge, 1. - ice));
          gl_FragColor = vec4(tint, (ice * .95 + halo) * opacity);
        }`} />
  </points>
}
