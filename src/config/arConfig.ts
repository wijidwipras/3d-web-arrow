export const bowModelSrc = '/models/rust-bow.glb'
export const arrowModelSrc = '/models/arrow.glb'
export const maxRenderDpr = 2
export const inferenceIntervalMs = 50

// Prepared Rust bow coordinates; regenerate with scripts/prepare-models.py.
export const bowRig = {
  modelCenterX: -.20458859636,
  modelHeight: 1.76,
  stringX: 0,
  stringBottomY: .28985643645,
  stringMiddleY: .95004503242,
  stringTopY: 1.61023362840,
  maxPull: .55,
} as const

export function gestureLabel(name: string | null): string {
  switch (name) {
    case 'Open_Palm': return 'Telapak terbuka'
    case 'Pointing_Up': return 'Telunjuk ke atas'
    case 'Closed_Fist': return 'Tangan mengepal'
    case 'Victory': return 'Dua jari'
    case 'None': return 'Belum dikenali'
    default: return name ?? 'Belum ada'
  }
}
