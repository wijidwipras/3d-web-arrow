export const bowModelSrc = '/models/busur.glb'
export const arrowModelSrc = '/models/anak-panah.glb'
export const maxRenderDpr = 2
export const inferenceIntervalMs = 50

// Local coordinates measured from public/models/busur.glb.
export const bowRig = {
  modelCenterX: -.023611918,
  modelHeight: 1.76,
  stringX: .175,
  stringBottomY: .07,
  stringMiddleY: .95,
  stringTopY: 1.83,
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
