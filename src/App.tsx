import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { Aperture, Camera, CameraOff, ChevronRight, Hand, RotateCcw, Settings2, ShieldCheck, Sparkles, VideoOff, X } from 'lucide-react'
import ARViewer from './components/ARViewer'
import HandOverlay from './components/HandOverlay'
import ArcheryFeedback from './components/ArcheryFeedback'
import { arrowModelSrc, bowModelSrc, gestureLabel } from './config/arConfig'
import { ArcheryController, type ArcherySnapshot } from './features/ar/archeryInteraction'
import { computeArrowPose, computeBowPose, defaultCalibration, type Calibration, type Viewport } from './features/ar/handPose'
import { useGestureCamera } from './features/camera/useGestureCamera'

const sliderFields: { key: keyof Calibration; label: string; min: number; max: number; step: number; format: (value: number) => string }[] = [
  { key: 'offsetX', label: 'Geser horizontal', min: -2, max: 2, step: .05, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'offsetY', label: 'Geser vertikal', min: -2, max: 2, step: .05, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'scale', label: 'Ukuran busur', min: .35, max: 1.8, step: .05, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'rotation', label: 'Putar busur', min: -90, max: 90, step: 1, format: (v) => `${v}°` },
]

const emptyArchery: ArcherySnapshot = { phase: 'idle', draw: 0, arrowPose: null, arrowVisible: false, shot: null, feedback: null }

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Viewport>({ width: window.innerWidth, height: window.innerHeight })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showTracking, setShowTracking] = useState(true)
  const [showBow, setShowBow] = useState(true)
  const [showArrow, setShowArrow] = useState(true)
  const [calibration, setCalibration] = useState<Calibration>(defaultCalibration)
  const [modelError, setModelError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [archery, setArchery] = useState<ArcherySnapshot>(emptyArchery)
  const archeryRef = useRef(new ArcheryController())
  const lastBowRotation = useRef<number | undefined>(undefined)
  const lastArrowRotation = useRef<number | undefined>(undefined)
  const camera = useGestureCamera()
  const ready = camera.status === 'ready'
  const busy = camera.status === 'requesting' || camera.status === 'loading'
  const tracked = ready && !!camera.tracking.bow
  const bowActive = ready && camera.tracking.bowGestureActive
  const arrowTracked = ready && !!camera.tracking.arrow
  const arrowActive = ready && camera.tracking.arrowGestureActive
  const anyTracked = tracked || arrowTracked

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // Returning visitors with an existing camera grant go straight to the full-screen feed.
  useEffect(() => {
    let cancelled = false
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'camera' as PermissionName })
        .then((permission) => { if (!cancelled && permission.state === 'granted') void camera.start() })
        .catch(() => undefined)
    }
    return () => { cancelled = true }
  }, [camera.start])

  const bowPose = useMemo(() => camera.tracking.bow
    ? computeBowPose(camera.tracking.bow.landmarks, viewport, camera.tracking.video, calibration, lastBowRotation.current)
    : null,
  [camera.tracking.bow, camera.tracking.video, viewport, calibration])
  const arrowPose = useMemo(() => {
    if (!camera.tracking.arrow) return null
    const pose = computeArrowPose(
      camera.tracking.arrow.landmarks, viewport, camera.tracking.video, lastArrowRotation.current,
    )
    return pose
  }, [camera.tracking.arrow, camera.tracking.video, viewport])

  useEffect(() => {
    if (bowPose) lastBowRotation.current = bowPose.rotation
  }, [bowPose])

  useEffect(() => {
    if (arrowPose) lastArrowRotation.current = arrowPose.rotation
  }, [arrowPose])

  useEffect(() => {
    if (!ready) {
      lastBowRotation.current = undefined
      lastArrowRotation.current = undefined
    }
  }, [ready])

  useEffect(() => {
    if (!ready) {
      archeryRef.current.reset()
      setArchery(emptyArchery)
      return
    }
    setArchery(archeryRef.current.update({
      bowPose,
      bowActive: bowActive && showBow,
      handArrowPose: arrowPose,
      arrowHand: camera.tracking.arrow,
      arrowGestureActive: arrowActive,
      viewport,
      video: camera.tracking.video,
      now: performance.now(),
    }))
  }, [ready, bowPose, bowActive, arrowPose, arrowActive, camera.tracking, viewport, showBow])

  const toggleCamera = () => {
    if (ready || busy) {
      camera.stop()
    }
    else void camera.start()
  }

  const retryModel = () => {
    useGLTF.clear(bowModelSrc)
    useGLTF.clear(arrowModelSrc)
    setModelError(false)
    setRetryKey((key) => key + 1)
  }

  const statusText = camera.status === 'requesting' ? 'Menunggu izin kamera'
    : camera.status === 'loading' ? 'Menyiapkan tracking tangan'
      : ready ? arrowTracked && tracked ? 'Dua tangan terdeteksi' : tracked ? 'Tangan busur terdeteksi' : arrowTracked ? 'Tangan panah terdeteksi' : 'Cari tangan di depan kamera'
        : camera.status === 'error' ? 'Kamera tidak tersedia' : 'Kamera belum aktif'

  return <div ref={stageRef} className="ar-app">
    <video ref={camera.videoRef} className={`ar-video ${ready || busy ? 'is-on' : ''}`} autoPlay muted playsInline aria-label="Kamera AR layar penuh" />
    <div className="ar-video-shade" />
    <ARViewer bowPose={archery.feedback?.bowPose ?? bowPose} arrowPose={archery.arrowPose} viewport={viewport} showBow={showBow && bowActive} showArrow={ready && showArrow && archery.arrowVisible} allowArrows={ready && showArrow} bowDraw={archery.draw} shot={archery.shot} retryKey={retryKey} onError={() => setModelError(true)} />
    <HandOverlay landmarks={{ bow: camera.tracking.bow?.landmarks ?? null, arrow: camera.tracking.arrow?.landmarks ?? null }} viewport={viewport} video={camera.tracking.video} visible={ready && showTracking} />

    {ready && showBow && showArrow && <ArcheryFeedback snapshot={archery} viewport={viewport} />}

    <header className="ar-header">
      <div className="ar-brand"><span className="ar-brand-icon"><Sparkles size={19} /></span><span>GESTURE <em>AR</em></span><span className="brand-beta">BETA</span></div>
      <div className="header-actions">
        <div className={`header-status ${ready ? 'is-live' : ''}`}><span className="status-dot" />{ready ? 'LIVE CAMERA' : busy ? 'CONNECTING' : 'CAMERA OFF'}</div>
        <button className={`icon-button ${settingsOpen ? 'is-selected' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-label={settingsOpen ? 'Tutup pengaturan' : 'Buka pengaturan'} title="Pengaturan AR"><Settings2 size={20} /></button>
      </div>
    </header>

    {ready && <div className="ar-left-rail">
      <span className="rail-label">HAND TRACKING</span>
      <div className={`rail-tracking ${anyTracked ? 'active' : ''}`}><Hand size={25} /><span>{anyTracked ? 'TERDETEKSI' : 'MENCARI TANGAN'}</span></div>
      <span className="rail-line" />
      <span className="rail-small">{tracked && arrowTracked ? '2 tangan' : anyTracked ? '1 tangan' : '0 tangan'}</span>
    </div>}

    {!ready && <div className="start-overlay">
      <div className="start-icon"><Aperture size={37} strokeWidth={1.3} /></div>
      <div className="start-eyebrow">REALTIME HAND-TRACKED 3D</div>
      <h1>Busur di tanganmu.</h1>
      <p>Buka lima jari tangan kiri untuk memunculkan busur, lalu dua jari tangan kanan untuk anak panah. Cubit dekat tali, tarik, lalu lepaskan untuk menembak.</p>
      {camera.error && <div className="start-error" role="alert">{camera.error}</div>}
      <button className="start-button" onClick={toggleCamera}>
        {busy ? <><span className="button-spinner" /> Batalkan</> : <><Camera size={19} /> {camera.status === 'error' ? 'Coba lagi' : 'Mulai AR'} <ChevronRight size={18} /></>}
      </button>
      <span className="privacy"><ShieldCheck size={15} /> Kamera diproses lokal di perangkatmu</span>
    </div>}

    {ready && <div className="ar-bottom-hud">
      <div className="hud-primary"><span className={`hud-pulse ${anyTracked ? 'active' : ''}`} /><div><span className="hud-kicker">STATUS TRACKING</span><strong>{statusText}</strong></div></div>
      <div className="hud-divider" />
      <div className="hud-secondary"><span className="hud-kicker">TANGAN PANAH</span><strong>{archery.phase === 'drawing' ? `Tarik ${Math.round(archery.draw * 100)}%` : archery.phase === 'nocked' ? 'Terkait di tali' : archery.phase === 'flying' ? 'Panah meluncur' : arrowActive ? 'Dua jari' : arrowTracked ? gestureLabel(camera.tracking.arrow?.gesture ?? null) : '—'}</strong></div>
      <div className="hud-divider" />
      <div className="hud-secondary"><span className="hud-kicker">MODEL AKTIF</span><strong>{showBow && bowActive ? showArrow && archery.arrowVisible ? 'Busur + Panah' : 'Rust Bow' : showArrow && archery.arrowVisible ? 'Anak Panah' : 'Menunggu gestur'}</strong></div>
      <button className="hud-camera" onClick={camera.stop} title="Matikan kamera"><CameraOff size={18} /><span>Matikan Kamera</span></button>
    </div>}

    {ready && !anyTracked && !archery.feedback?.recovering && <div className="hand-guidance"><div className="guidance-ring"><Hand size={39} strokeWidth={1.2} /></div><span>Letakkan tangan di tengah kamera</span><small>Pastikan tangan terlihat jelas dan pencahayaan cukup</small></div>}
    {ready && !tracked && arrowTracked && !archery.feedback?.recovering && <div className="second-hand-tip">Tampilkan tangan kiri dan buka lima jari untuk busur</div>}
    {ready && tracked && !bowActive && <div className="second-hand-tip">Buka lima jari pada tangan kiri</div>}
    {ready && bowActive && tracked && (archery.phase === 'idle' || archery.phase === 'flying') && <div className="second-hand-tip">{arrowTracked ? 'Tunjukkan dua jari untuk menyiapkan panah' : 'Angkat tangan kedua, lalu tunjukkan dua jari'}</div>}
    {modelError && <div className="model-toast" role="alert"><VideoOff size={17} /> Model 3D gagal dimuat.<button onClick={retryModel}>Coba lagi</button></div>}

    {settingsOpen && <aside className="settings-panel" aria-label="Pengaturan AR">
      <div className="settings-heading"><div><span className="panel-eyebrow">KONTROL / AR</span><h2>Pengaturan</h2></div><button className="close-settings" onClick={() => setSettingsOpen(false)} aria-label="Tutup pengaturan"><X size={19} /></button></div>
      <p className="settings-intro">Sesuaikan tampilan busur agar pegangannya pas di telapak tanganmu.</p>
      <div className="setting-toggle"><div><strong>Tampilkan busur</strong><small>Muncul setelah membuka lima jari</small></div><button className={`switch ${showBow ? 'on' : ''}`} onClick={() => setShowBow((value) => !value)} role="switch" aria-checked={showBow} aria-label="Tampilkan busur"><span /></button></div>
      <div className="setting-toggle"><div><strong>Tampilkan anak panah</strong><small>Dua jari, lalu cubit tali untuk menarik</small></div><button className={`switch ${showArrow ? 'on' : ''}`} onClick={() => setShowArrow((value) => !value)} role="switch" aria-checked={showArrow} aria-label="Tampilkan anak panah"><span /></button></div>
      <div className="setting-toggle"><div><strong>Rangka tangan</strong><small>Titik dan garis tracking di layar</small></div><button className={`switch ${showTracking ? 'on' : ''}`} onClick={() => setShowTracking((value) => !value)} role="switch" aria-checked={showTracking} aria-label="Tampilkan rangka tangan"><span /></button></div>
      <div className="setting-section-title"><span>KALIBRASI BUSUR</span><span>LIVE</span></div>
      {sliderFields.map((field) => <label className="calibration-field" key={field.key}><span><strong>{field.label}</strong><output>{field.format(calibration[field.key])}</output></span><input type="range" min={field.min} max={field.max} step={field.step} value={calibration[field.key]} onChange={(event) => setCalibration((current) => ({ ...current, [field.key]: Number(event.target.value) }))} /></label>)}
      <button className="reset-calibration" onClick={() => setCalibration(defaultCalibration)}><RotateCcw size={15} /> Reset kalibrasi</button>
      <div className="settings-footnote"><ShieldCheck size={16} /> Video dan titik tangan tetap di browser, tanpa unggahan.</div>
    </aside>}
  </div>
}
