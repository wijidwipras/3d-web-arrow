import type { ArcherySnapshot } from '../features/ar/archeryInteraction'
import { bowStringCenter } from '../features/ar/archeryInteraction'
import type { Viewport } from '../features/ar/handPose'

/** Read-only guidance from the same state machine that attaches and fires arrows. */
export default function ArcheryFeedback({ snapshot, viewport }: {
  snapshot: ArcherySnapshot
  viewport: Viewport
}) {
  const { phase, draw, feedback } = snapshot
  if (!feedback || !['armed', 'nocked', 'drawing'].includes(phase)) return null
  const attached = phase === 'nocked' || phase === 'drawing'
  const center = feedback.bowPose ? bowStringCenter(feedback.bowPose) : null
  const hint = feedback.recovering
    ? 'Tarikan ditahan — pisahkan sedikit kedua tangan dan pertahankan cubitan'
    : !feedback.bowPose ? 'Tampilkan tangan busur dengan lima jari'
      : !feedback.pinchPoint ? 'Tampilkan tangan panah dengan jelas'
        : attached
          ? feedback.canShoot ? 'Buka cubitan untuk menembak' : 'Terkait — tarik sekarang'
          : feedback.nearString ? 'Sudah dekat — cubit untuk mengaitkan panah' : 'Dekatkan ibu jari dan telunjuk ke lingkaran di tali'
  // Keep labels within the camera viewport, clear of the bottom controls.
  const labelPosition = center ? {
    left: Math.max(100, Math.min(viewport.width - 100, center.x)),
    top: Math.max(150, Math.min(viewport.height - 170, center.y + 50)),
  } : undefined
  return <div className="archery-feedback">
    <div className="second-hand-tip" role="status" aria-live="polite">{hint}</div>
    {center && !attached && <div
      className={`nock-target ${feedback.nearString ? 'is-near' : ''}`}
      style={{ left: center.x, top: center.y }}
      aria-hidden="true"
    >+</div>}
    {feedback.pinchPoint && !feedback.recovering && <div
      className={`pinch-marker ${feedback.pinching ? 'is-locked' : ''}`}
      style={{ left: feedback.pinchPoint.x, top: feedback.pinchPoint.y }}
      aria-label={feedback.pinching ? 'Cubitan terkunci' : 'Cubitan terbuka'}
    ><span>{feedback.pinching ? '✓' : '○'}</span></div>}
    {attached && center && <div className={`draw-feedback ${feedback.recovering ? 'is-recovering' : ''}`} style={labelPosition}>
      <strong>{feedback.recovering ? 'Tracking terhalang' : feedback.canShoot ? 'Siap tembak' : 'Panah terkait'}</strong>
      <div className="draw-meter" role="meter" aria-label="Kekuatan tarikan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(draw * 100)}>
        <span style={{ width: `${draw * 100}%`, background: `hsl(${180 - draw * 140}, 85%, 65%)` }} />
      </div>
      <small>{Math.round(draw * 100)}% daya · {feedback.recovering ? 'Tahan cubitan' : 'Tarik menjauhi busur'}</small>
    </div>}
  </div>
}
