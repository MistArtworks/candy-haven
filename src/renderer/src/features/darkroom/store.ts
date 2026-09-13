import { create } from 'zustand'
import type { CurvePoint, GradeSettings, RampStop } from '@shared/domain/darkroom'
import { CONSOLE_RAMP, DEFAULT_GRADE, IDENTITY_CURVE } from '@shared/domain/darkroom'

/**
 * The grade in progress, held above the page.
 *
 * In a store rather than in `DarkroomPage` state because leaving the department
 * unmounts the page, and an operator who steps into ARCHIVE to check a track
 * name should not come back to a reset grade. The loaded image is deliberately
 * *not* kept here — an `ImageBitmap` is GPU-backed memory, and holding one for
 * the life of the session to save a re-drop is the wrong trade.
 *
 * Nothing here is persisted to disk. A grade is a working state, not a setting,
 * and the console ramp preset is what a fresh session should open on.
 */
interface DarkroomState {
  grade: GradeSettings
  /** Patches one or more controls. */
  set: (patch: Partial<GradeSettings>) => void
  setCurve: (curve: CurvePoint[]) => void
  setStops: (stops: RampStop[]) => void
  /** Back to the console ramp with every tonal control at rest. */
  reset: () => void
  /** Returns the numeric controls to rest, leaving the curve and ramp alone. */
  resetTone: () => void
  /** Straightens the curve without touching anything else. */
  resetCurve: () => void
  /** Restores the console ramp without touching the tonal controls. */
  resetRamp: () => void
}

const freshGrade = (): GradeSettings => ({
  ...DEFAULT_GRADE,
  curve: IDENTITY_CURVE.map((point) => ({ ...point })),
  stops: CONSOLE_RAMP.map((stop) => ({ ...stop }))
})

export const useDarkroomStore = create<DarkroomState>((set) => ({
  grade: freshGrade(),
  set: (patch) => set((state) => ({ grade: { ...state.grade, ...patch } })),
  setCurve: (curve) => set((state) => ({ grade: { ...state.grade, curve } })),
  setStops: (stops) => set((state) => ({ grade: { ...state.grade, stops } })),
  reset: () => set({ grade: freshGrade() }),
  resetTone: () =>
    set((state) => ({
      grade: {
        ...state.grade,
        exposure: DEFAULT_GRADE.exposure,
        contrast: DEFAULT_GRADE.contrast,
        blackPoint: DEFAULT_GRADE.blackPoint,
        whitePoint: DEFAULT_GRADE.whitePoint,
        gamma: DEFAULT_GRADE.gamma,
        amount: DEFAULT_GRADE.amount,
        saturation: DEFAULT_GRADE.saturation
      }
    })),
  resetCurve: () =>
    set((state) => ({
      grade: { ...state.grade, curve: IDENTITY_CURVE.map((point) => ({ ...point })) }
    })),
  resetRamp: () =>
    set((state) => ({
      grade: { ...state.grade, stops: CONSOLE_RAMP.map((stop) => ({ ...stop })) }
    }))
}))
